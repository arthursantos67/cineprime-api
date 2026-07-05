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

        user.refresh_from_db()
        assert user.check_password("NewPassword456*") is True
        assert user.check_password("OldPassword123*") is False

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
