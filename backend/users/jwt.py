"""JWT issuance and validation bound to the user's current password.

Tokens carry a fingerprint of the password hash they were issued against.
Changing the password changes the fingerprint, which immediately invalidates
every previously issued access and refresh token — without requiring a
database-backed blacklist.
"""

import hashlib

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

PASSWORD_FINGERPRINT_CLAIM = "pwd_fp"


def password_fingerprint(user) -> str:
    return hashlib.sha256(user.password.encode("utf-8")).hexdigest()[:16]


def issue_tokens_for_user(user) -> RefreshToken:
    refresh = RefreshToken.for_user(user)
    refresh[PASSWORD_FINGERPRINT_CLAIM] = password_fingerprint(user)
    return refresh


def _validate_password_fingerprint(token, user) -> None:
    if token.get(PASSWORD_FINGERPRINT_CLAIM) != password_fingerprint(user):
        raise InvalidToken("Token is no longer valid because the password changed.")


class PasswordChangeAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        _validate_password_fingerprint(validated_token, user)
        return user


class PasswordChangeAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])

        from django.contrib.auth import get_user_model

        user = (
            get_user_model()
            .objects.filter(pk=refresh.get("user_id"), is_active=True)
            .first()
        )
        if user is None:
            raise InvalidToken("Token contained no recognizable user identification.")
        _validate_password_fingerprint(refresh, user)

        return super().validate(attrs)
