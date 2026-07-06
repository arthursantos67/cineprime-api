from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient
from users.jwt import issue_tokens_for_user

from users.tokens import generate_email_verification_token

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
    from users.views import (
        EmailVerificationView,
        ResendEmailVerificationView,
        UserRegistrationView,
    )

    original_registration_throttles = UserRegistrationView.throttle_classes
    original_resend_throttles = ResendEmailVerificationView.throttle_classes
    original_verify_throttles = EmailVerificationView.throttle_classes
    UserRegistrationView.throttle_classes = []
    ResendEmailVerificationView.throttle_classes = []
    EmailVerificationView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    UserRegistrationView.throttle_classes = original_registration_throttles
    ResendEmailVerificationView.throttle_classes = original_resend_throttles
    EmailVerificationView.throttle_classes = original_verify_throttles


@pytest.fixture
def user():
    return User.objects.create_user(
        email="verify-me@example.com",
        username="verifyme",
        password="StrongPassword123",
    )


@pytest.mark.django_db
@override_settings(AUTO_VERIFY_NEW_USERS=False)
def test_registration_enqueues_verification_email():
    client = APIClient()

    payload = {
        "email": "newverify@example.com",
        "username": "newverify",
        "password": "StrongPassword123",
    }

    with patch("users.tasks.send_email_verification_email_task.apply_async") as mock_apply_async:
        response = client.post("/api/v1/auth/register/", payload, format="json")

    assert response.status_code == 201
    user_id = response.data["id"]
    mock_apply_async.assert_called_once()
    call_args = mock_apply_async.call_args.kwargs["args"]
    assert call_args[0] == str(user_id)


@pytest.mark.django_db
@override_settings(AUTO_VERIFY_NEW_USERS=True)
def test_registration_auto_verifies_without_email_when_enabled():
    client = APIClient()

    payload = {
        "email": "autoverify@example.com",
        "username": "autoverify",
        "password": "StrongPassword123",
    }

    with patch("users.tasks.send_email_verification_email_task.apply_async") as mock_apply_async:
        response = client.post("/api/v1/auth/register/", payload, format="json")

    assert response.status_code == 201
    mock_apply_async.assert_not_called()
    user = User.objects.get(email=payload["email"])
    assert user.is_verified is True


@pytest.mark.django_db
def test_verify_email_with_valid_token_marks_user_verified(user):
    client = APIClient()
    token = generate_email_verification_token(user)

    response = client.get(f"/api/v1/auth/verify-email/{token}/")

    assert response.status_code == 200
    assert response.data["verified"] is True
    assert response.data["already_verified"] is False

    user.refresh_from_db()
    assert user.is_verified is True


@pytest.mark.django_db
def test_verify_email_is_idempotent(user):
    client = APIClient()
    token = generate_email_verification_token(user)

    first_response = client.get(f"/api/v1/auth/verify-email/{token}/")
    second_response = client.get(f"/api/v1/auth/verify-email/{token}/")

    assert first_response.status_code == 200
    assert first_response.data["already_verified"] is False
    assert second_response.status_code == 200
    assert second_response.data["already_verified"] is True


@pytest.mark.django_db
def test_verify_email_rejects_garbage_token():
    client = APIClient()

    response = client.get("/api/v1/auth/verify-email/not-a-real-token/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_VERIFICATION_TOKEN"


@pytest.mark.django_db
def test_verify_email_rejects_expired_token(user):
    client = APIClient()
    token = generate_email_verification_token(user)

    with override_settings(EMAIL_VERIFICATION_TOKEN_MAX_AGE_SECONDS=0):
        import time

        time.sleep(1)
        response = client.get(f"/api/v1/auth/verify-email/{token}/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_VERIFICATION_TOKEN"

    user.refresh_from_db()
    assert user.is_verified is False


@pytest.mark.django_db
def test_verify_email_rejects_token_for_deleted_user(user):
    client = APIClient()
    token = generate_email_verification_token(user)
    user.delete()

    response = client.get(f"/api/v1/auth/verify-email/{token}/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_VERIFICATION_TOKEN"


@pytest.mark.django_db
def test_resend_verification_requires_authentication():
    client = APIClient()

    response = client.post("/api/v1/auth/verify-email/resend/")

    assert response.status_code == 401


@pytest.mark.django_db
def test_resend_verification_enqueues_email_for_unverified_user(user):
    client = APIClient()
    refresh = issue_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    with patch("users.tasks.send_email_verification_email_task.apply_async") as mock_apply_async:
        response = client.post("/api/v1/auth/verify-email/resend/")

    assert response.status_code == 200
    assert response.data["already_verified"] is False
    mock_apply_async.assert_called_once()


@pytest.mark.django_db
def test_resend_verification_is_noop_for_verified_user(user):
    user.is_verified = True
    user.save(update_fields=["is_verified"])

    client = APIClient()
    refresh = issue_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    with patch("users.tasks.send_email_verification_email_task.apply_async") as mock_apply_async:
        response = client.post("/api/v1/auth/verify-email/resend/")

    assert response.status_code == 200
    assert response.data["already_verified"] is True
    mock_apply_async.assert_not_called()
