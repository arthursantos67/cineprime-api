from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from users.tokens import generate_email_change_token

User = get_user_model()


REST_FRAMEWORK_OVERRIDE = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
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
def disable_throttling_for_module():
    from users.views import CurrentUserView, EmailChangeConfirmView

    original_current_user_throttles = CurrentUserView.throttle_classes
    original_confirm_throttles = EmailChangeConfirmView.throttle_classes
    CurrentUserView.throttle_classes = []
    EmailChangeConfirmView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    CurrentUserView.throttle_classes = original_current_user_throttles
    EmailChangeConfirmView.throttle_classes = original_confirm_throttles


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

    def test_email_change_does_not_apply_immediately_and_sends_confirmation(
        self, auth_client, user
    ):
        with patch(
            "users.tasks.send_email_change_email_task.apply_async"
        ) as mock_apply_async:
            response = auth_client.patch(
                "/api/v1/users/me/", {"email": "new-address@example.com"}
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == "profile@example.com"
        assert response.data["email_change_requested"] is True

        user.refresh_from_db()
        assert user.email == "profile@example.com"

        mock_apply_async.assert_called_once()
        call_args = mock_apply_async.call_args.kwargs["args"]
        assert call_args[0] == str(user.id)
        assert call_args[1] == "new-address@example.com"

    def test_email_change_to_taken_address_is_generic_and_sends_nothing(
        self, auth_client, user
    ):
        User.objects.create_user(
            email="taken@example.com",
            username="takenemail",
            password="StrongPassword123",
        )

        with patch(
            "users.tasks.send_email_change_email_task.apply_async"
        ) as mock_apply_async:
            response = auth_client.patch(
                "/api/v1/users/me/", {"email": "taken@example.com"}
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email_change_requested"] is True
        mock_apply_async.assert_not_called()

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_same_email_is_a_no_op(self, auth_client, user):
        with patch(
            "users.tasks.send_email_change_email_task.apply_async"
        ) as mock_apply_async:
            response = auth_client.patch("/api/v1/users/me/", {"email": user.email})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email_change_requested"] is False
        mock_apply_async.assert_not_called()


@pytest.mark.django_db
class TestEmailChangeConfirm:
    def test_confirms_email_change_and_marks_verified(self, api_client, user):
        token = generate_email_change_token(user, "confirmed@example.com")

        response = api_client.get(f"/api/v1/auth/change-email/{token}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"email": "confirmed@example.com", "changed": True}

        user.refresh_from_db()
        assert user.email == "confirmed@example.com"
        assert user.is_verified is True

    def test_rejects_invalid_token(self, api_client):
        response = api_client.get("/api/v1/auth/change-email/not-a-valid-token/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "INVALID_EMAIL_CHANGE_TOKEN"

    def test_rejects_token_when_email_taken_meanwhile(self, api_client, user):
        token = generate_email_change_token(user, "raced@example.com")
        User.objects.create_user(
            email="raced@example.com",
            username="racer",
            password="StrongPassword123",
        )

        response = api_client.get(f"/api/v1/auth/change-email/{token}/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.email == "profile@example.com"

    def test_already_applied_token_is_idempotent(self, api_client, user):
        token = generate_email_change_token(user, "confirmed@example.com")

        first = api_client.get(f"/api/v1/auth/change-email/{token}/")
        second = api_client.get(f"/api/v1/auth/change-email/{token}/")

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_200_OK
        assert second.data == {"email": "confirmed@example.com", "changed": False}
