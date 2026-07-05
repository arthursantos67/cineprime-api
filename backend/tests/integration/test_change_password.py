import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

CHANGE_PASSWORD_URL = "/api/v1/users/me/change-password/"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="rotate@example.com",
        username="rotateuser",
        password="OldPassword123*",
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestChangePassword:
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "OldPassword123*", "new_password": "NewPassword456*"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_changes_password_with_correct_current_password(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "OldPassword123*", "new_password": "NewPassword456*"},
        )

        assert response.status_code == status.HTTP_200_OK
        # A fresh token pair is issued so the caller can keep this session.
        assert response.data["access"]
        assert response.data["refresh"]

        user.refresh_from_db()
        assert user.check_password("NewPassword456*") is True
        assert user.check_password("OldPassword123*") is False

    def test_previously_issued_tokens_stop_working_after_change(
        self, api_client, user
    ):
        login = api_client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "OldPassword123*"},
        )
        assert login.status_code == status.HTTP_200_OK
        old_access = login.data["access"]
        old_refresh = login.data["refresh"]

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        change = api_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "OldPassword123*", "new_password": "NewPassword456*"},
        )
        assert change.status_code == status.HTTP_200_OK

        # The pre-change access token no longer authenticates...
        stale = api_client.get("/api/v1/users/me/")
        assert stale.status_code == status.HTTP_401_UNAUTHORIZED

        # ...and the pre-change refresh token cannot mint new access tokens.
        api_client.credentials()
        refresh = api_client.post(
            "/api/v1/auth/token/refresh/", {"refresh": old_refresh}
        )
        assert refresh.status_code == status.HTTP_401_UNAUTHORIZED

        # The freshly issued pair works.
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {change.data['access']}")
        assert api_client.get("/api/v1/users/me/").status_code == status.HTTP_200_OK

    def test_rejects_new_password_similar_to_email(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "OldPassword123*", "new_password": "rotate@example.com1"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.check_password("OldPassword123*") is True

    def test_rejects_wrong_current_password(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "WrongPassword999*", "new_password": "NewPassword456*"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"]["code"] == "WRONG_PASSWORD"

        user.refresh_from_db()
        assert user.check_password("OldPassword123*") is True

    def test_rejects_weak_new_password(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD_URL,
            {"current_password": "OldPassword123*", "new_password": "123"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

        user.refresh_from_db()
        assert user.check_password("OldPassword123*") is True

    def test_rejects_missing_fields(self, auth_client):
        response = auth_client.post(CHANGE_PASSWORD_URL, {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
