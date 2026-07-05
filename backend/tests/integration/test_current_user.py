import pytest
from rest_framework import status
from rest_framework.test import APIClient
from users.jwt import issue_tokens_for_user

from users.models import User


@pytest.mark.django_db
class TestCurrentUserView:
    @pytest.fixture
    def api_client(self):
        return APIClient()

    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            email="orlando@gmail.com",
            username="pablo2265",
            password="Soueu123*A",
        )

    def test_current_user_requires_authentication(self, api_client):
        response = api_client.get("/api/v1/users/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data["error"]["code"] == "NOT_AUTHENTICATED"

    def test_current_user_returns_authenticated_user(self, api_client, user):
        refresh = issue_tokens_for_user(user)
        access_token = str(refresh.access_token)

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = api_client.get("/api/v1/users/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(user.id)
        assert response.data["email"] == user.email
        assert response.data["username"] == user.username
        assert "created_at" in response.data

    def test_current_user_returns_is_staff_false_for_regular_user(self, api_client, user):
        refresh = issue_tokens_for_user(user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

        response = api_client.get("/api/v1/users/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is False

    def test_current_user_returns_is_staff_true_for_admin_user(self, api_client):
        admin = User.objects.create_user(
            email="admin@gmail.com",
            username="adminuser",
            password="Soueu123*A",
            is_staff=True,
        )
        refresh = issue_tokens_for_user(admin)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

        response = api_client.get("/api/v1/users/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is True

    def test_current_user_returns_401_with_invalid_token(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")

        response = api_client.get("/api/v1/users/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data["error"]["code"] == "NOT_AUTHENTICATED"
