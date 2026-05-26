import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

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
    from users.views import UserRegistrationView

    original_user_registration_throttles = UserRegistrationView.throttle_classes
    UserRegistrationView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    UserRegistrationView.throttle_classes = original_user_registration_throttles


@pytest.mark.django_db
def test_user_registration_succeeds():
    client = APIClient()

    payload = {
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "StrongPassword123",
    }

    response = client.post("/api/v1/auth/register/", payload, format="json")

    assert response.status_code == 201
    assert response.data["email"] == payload["email"]
    assert response.data["username"] == payload["username"]
    assert "password" not in response.data

    user = User.objects.get(email=payload["email"])
    assert user.username == payload["username"]
    assert user.check_password(payload["password"])
    assert str(user.password) != payload["password"]


@pytest.mark.django_db
def test_user_registration_rejects_duplicate_email():
    User.objects.create_user(
        email="duplicate@example.com",
        username="existinguser",
        password="StrongPassword123",
    )

    client = APIClient()

    payload = {
        "email": "duplicate@example.com",
        "username": "newusername",
        "password": "StrongPassword123",
    }

    response = client.post("/api/v1/auth/register/", payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "email" in response.data["error"]["details"]


@pytest.mark.django_db
def test_user_registration_rejects_duplicate_username():
    User.objects.create_user(
        email="existing@example.com",
        username="duplicateuser",
        password="StrongPassword123",
    )

    client = APIClient()

    payload = {
        "email": "new@example.com",
        "username": "duplicateuser",
        "password": "StrongPassword123",
    }

    response = client.post("/api/v1/auth/register/", payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "username" in response.data["error"]["details"]


@pytest.mark.django_db
def test_user_registration_requires_email_username_and_password():
    client = APIClient()

    response = client.post("/api/v1/auth/register/", {}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "email" in response.data["error"]["details"]
    assert "username" in response.data["error"]["details"]
    assert "password" in response.data["error"]["details"]
