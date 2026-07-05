from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
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
    from users.views import PasswordResetConfirmView, PasswordResetRequestView

    original_request_throttles = PasswordResetRequestView.throttle_classes
    original_confirm_throttles = PasswordResetConfirmView.throttle_classes
    PasswordResetRequestView.throttle_classes = []
    PasswordResetConfirmView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    PasswordResetRequestView.throttle_classes = original_request_throttles
    PasswordResetConfirmView.throttle_classes = original_confirm_throttles


@pytest.fixture
def user():
    return User.objects.create_user(
        email="reset-me@example.com",
        username="resetme",
        password="OldStrongPassword123",
    )


def _build_reset_payload(user, *, password="NewStrongPassword456"):
    return {
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": default_token_generator.make_token(user),
        "new_password": password,
    }


@pytest.mark.django_db
def test_password_reset_request_with_known_email_enqueues_email(user):
    client = APIClient()

    with patch("users.tasks.send_password_reset_email_task.apply_async") as mock_apply_async:
        response = client.post(
            "/api/v1/auth/password-reset/",
            {"email": user.email},
            format="json",
        )

    assert response.status_code == 200
    mock_apply_async.assert_called_once()
    call_args = mock_apply_async.call_args.kwargs["args"]
    assert call_args[0] == str(user.id)


@pytest.mark.django_db
def test_password_reset_request_with_unknown_email_returns_identical_response(user):
    client = APIClient()

    with patch("users.tasks.send_password_reset_email_task.apply_async") as mock_apply_async:
        known_response = client.post(
            "/api/v1/auth/password-reset/",
            {"email": user.email},
            format="json",
        )
        unknown_response = client.post(
            "/api/v1/auth/password-reset/",
            {"email": "nobody-here@example.com"},
            format="json",
        )

    assert known_response.status_code == unknown_response.status_code == 200
    assert known_response.content == unknown_response.content
    assert mock_apply_async.call_count == 1


@pytest.mark.django_db
def test_password_reset_confirm_with_valid_token_changes_password(user):
    client = APIClient()
    payload = _build_reset_payload(user)

    response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )

    assert response.status_code == 200

    login_response = client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": "NewStrongPassword456"},
        format="json",
    )
    assert login_response.status_code == 200


@pytest.mark.django_db
def test_password_reset_confirm_rejects_invalid_token(user):
    client = APIClient()
    payload = _build_reset_payload(user)
    payload["token"] = "invalid-token"

    response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_RESET_TOKEN"


@pytest.mark.django_db
def test_password_reset_confirm_rejects_garbage_uid(user):
    client = APIClient()
    payload = _build_reset_payload(user)
    payload["uid"] = "not-a-real-uid"

    response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_RESET_TOKEN"


@pytest.mark.django_db
def test_password_reset_confirm_rejects_reused_token(user):
    client = APIClient()
    payload = _build_reset_payload(user)

    first_response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )
    second_response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 400
    assert second_response.data["error"]["code"] == "INVALID_RESET_TOKEN"


@pytest.mark.django_db
def test_password_reset_confirm_rejects_weak_password(user):
    client = APIClient()
    payload = _build_reset_payload(user, password="short")

    response = client.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
