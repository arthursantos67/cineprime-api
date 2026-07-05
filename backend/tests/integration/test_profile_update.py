from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from users.tokens import generate_email_change_token

User = get_user_model()

EMAIL_CHANGE_CONFIRM_URL = "/api/v1/auth/change-email/"

REST_FRAMEWORK_OVERRIDE = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "users.jwt.PasswordChangeAwareJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
    "EXCEPTION_HANDLER": "cineprime_api.exception_handler.standardized_exception_handler",
}


@pytest.fixture(autouse=True)
def disable_throttling_for_module(monkeypatch):
    from users.views import CurrentUserView, EmailChangeConfirmView

    monkeypatch.setattr(CurrentUserView, "throttle_classes", [])
    monkeypatch.setattr(EmailChangeConfirmView, "throttle_classes", [])

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="profile@example.com",
        username="profileuser",
        password="StrongPassword123",
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _patch_email_tasks():
    return (
        patch("users.tasks.send_email_change_email_task.apply_async"),
        patch("users.tasks.send_email_change_notice_email_task.apply_async"),
    )


@pytest.mark.django_db
class TestProfileUpdate:
    def test_requires_authentication(self, api_client):
        response = api_client.patch("/api/v1/users/me/", {"username": "newname"})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_updates_username(self, auth_client, user):
        response = auth_client.patch("/api/v1/users/me/", {"username": "brandnewname"})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["username"] == "brandnewname"
        assert response.data["email_change_requested"] is False

        user.refresh_from_db()
        assert user.username == "brandnewname"

    def test_rejects_username_taken_by_another_user(self, auth_client):
        User.objects.create_user(
            email="other@example.com",
            username="takenname",
            password="StrongPassword123",
        )

        response = auth_client.patch("/api/v1/users/me/", {"username": "takenname"})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_accepts_own_current_username(self, auth_client, user):
        response = auth_client.patch("/api/v1/users/me/", {"username": user.username})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["username"] == user.username

    def test_rejects_blank_username(self, auth_client):
        response = auth_client.patch("/api/v1/users/me/", {"username": "   "})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_empty_payload(self, auth_client):
        response = auth_client.patch("/api/v1/users/me/", {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_email_change_requires_current_password(self, auth_client, user):
        change_mock, notice_mock = _patch_email_tasks()
        with change_mock as mock_change, notice_mock as mock_notice:
            response = auth_client.patch(
                "/api/v1/users/me/", {"email": "new-address@example.com"}
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "WRONG_PASSWORD"
        mock_change.assert_not_called()
        mock_notice.assert_not_called()

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_email_change_rejects_wrong_current_password(self, auth_client, user):
        change_mock, notice_mock = _patch_email_tasks()
        with change_mock as mock_change, notice_mock:
            response = auth_client.patch(
                "/api/v1/users/me/",
                {
                    "email": "new-address@example.com",
                    "current_password": "WrongPassword999",
                },
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "WRONG_PASSWORD"
        mock_change.assert_not_called()

    def test_username_change_does_not_require_current_password(self, auth_client):
        response = auth_client.patch("/api/v1/users/me/", {"username": "nopassneeded"})

        assert response.status_code == status.HTTP_200_OK

    def test_email_change_does_not_apply_immediately_and_sends_confirmation(
        self, auth_client, user
    ):
        change_mock, notice_mock = _patch_email_tasks()
        with change_mock as mock_change, notice_mock as mock_notice:
            response = auth_client.patch(
                "/api/v1/users/me/",
                {
                    "email": "new-address@example.com",
                    "current_password": "StrongPassword123",
                },
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == "profile@example.com"
        assert response.data["email_change_requested"] is True

        user.refresh_from_db()
        assert user.email == "profile@example.com"

        mock_change.assert_called_once()
        call_args = mock_change.call_args.kwargs["args"]
        assert call_args[0] == str(user.id)
        assert call_args[1] == "new-address@example.com"

        # The current (old) address is warned that a change was requested.
        mock_notice.assert_called_once()
        notice_args = mock_notice.call_args.kwargs["args"]
        assert notice_args[0] == str(user.id)

    def test_email_change_to_taken_address_is_generic_and_sends_no_confirmation(
        self, auth_client, user
    ):
        User.objects.create_user(
            email="taken@example.com",
            username="takenemail",
            password="StrongPassword123",
        )

        change_mock, notice_mock = _patch_email_tasks()
        with change_mock as mock_change, notice_mock:
            response = auth_client.patch(
                "/api/v1/users/me/",
                {
                    "email": "taken@example.com",
                    "current_password": "StrongPassword123",
                },
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email_change_requested"] is True
        mock_change.assert_not_called()

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_same_email_is_a_no_op(self, auth_client, user):
        change_mock, notice_mock = _patch_email_tasks()
        with change_mock as mock_change, notice_mock as mock_notice:
            response = auth_client.patch(
                "/api/v1/users/me/",
                {"email": user.email, "current_password": "StrongPassword123"},
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email_change_requested"] is False
        mock_change.assert_not_called()
        mock_notice.assert_not_called()


@pytest.mark.django_db
class TestEmailChangeConfirm:
    def _confirm(self, api_client, token):
        return api_client.post(EMAIL_CHANGE_CONFIRM_URL, {"token": token})

    def test_confirms_email_change_and_marks_verified(self, api_client, user):
        token = generate_email_change_token(user, "confirmed@example.com")

        response = self._confirm(api_client, token)

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"email": "confirmed@example.com", "changed": True}

        user.refresh_from_db()
        assert user.email == "confirmed@example.com"
        assert user.is_verified is True

    def test_get_is_not_allowed(self, api_client, user):
        # Applying the change on GET would let email link scanners trigger it.
        token = generate_email_change_token(user, "confirmed@example.com")

        response = api_client.get(f"{EMAIL_CHANGE_CONFIRM_URL}?token={token}")

        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_rejects_invalid_token(self, api_client):
        response = self._confirm(api_client, "not-a-valid-token")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "INVALID_EMAIL_CHANGE_TOKEN"

    def test_rejects_missing_token(self, api_client):
        response = api_client.post(EMAIL_CHANGE_CONFIRM_URL, {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_token_when_email_taken_meanwhile(self, api_client, user):
        token = generate_email_change_token(user, "raced@example.com")
        User.objects.create_user(
            email="raced@example.com",
            username="racer",
            password="StrongPassword123",
        )

        response = self._confirm(api_client, token)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_already_applied_token_cannot_be_reused(self, api_client, user):
        token = generate_email_change_token(user, "confirmed@example.com")

        first = self._confirm(api_client, token)
        second = self._confirm(api_client, token)

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.email == "confirmed@example.com"

    def test_applying_a_change_invalidates_other_pending_tokens(
        self, api_client, user
    ):
        # User mistypes an address, then requests the right one: once the
        # second change is applied, the first link must stop working.
        mistyped = generate_email_change_token(user, "wrong-address@example.com")
        corrected = generate_email_change_token(user, "right-address@example.com")

        assert self._confirm(api_client, corrected).status_code == status.HTTP_200_OK

        response = self._confirm(api_client, mistyped)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.email == "right-address@example.com"

    def test_rejects_expired_token(self, api_client, user, settings):
        token = generate_email_change_token(user, "expired@example.com")
        settings.EMAIL_CHANGE_TOKEN_MAX_AGE_SECONDS = -1

        response = self._confirm(api_client, token)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
