from django.urls import path

from users.views import (
    EmailVerificationView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ResendEmailVerificationView,
    UserLoginView,
    UserRegistrationView,
    UserTokenRefreshView,
)

urlpatterns = [
    path("register/", UserRegistrationView.as_view(), name="user-register"),
    path("login/", UserLoginView.as_view(), name="user-login"),
    path(
        "token/refresh/",
        UserTokenRefreshView.as_view(),
        name="token-refresh",
    ),
    path(
        "verify-email/resend/",
        ResendEmailVerificationView.as_view(),
        name="verify-email-resend",
    ),
    path(
        "verify-email/<str:token>/",
        EmailVerificationView.as_view(),
        name="verify-email",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
]
