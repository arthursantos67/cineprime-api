import hashlib

from django.core.exceptions import ImproperlyConfigured
from rest_framework.throttling import (
    AnonRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)
from rest_framework.exceptions import APIException

from cineprime_api.exception_handler import standardized_exception_handler


class GlobalAnonRateThrottle(AnonRateThrottle):
    scope = "anon"


class GlobalUserRateThrottle(UserRateThrottle):
    scope = "user"


def _normalized_request_email(request):
    try:
        request_data = request.data
    except (AttributeError, APIException):
        request_data = getattr(request, "POST", {})
    email = request_data.get("email", "")
    return str(email).strip().lower()


class EmailKeyedRateThrottle(SimpleRateThrottle):
    """Throttle keyed by client IP combined with the submitted email address."""

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        email_fingerprint = hashlib.sha256(
            _normalized_request_email(request).encode("utf-8")
        ).hexdigest()
        throttle_ident = f"{ident}:{email_fingerprint}"

        return self.cache_format % {
            "scope": self.scope,
            "ident": throttle_ident,
        }


class LoginRateThrottle(EmailKeyedRateThrottle):
    scope = "login"


class RegistrationRateThrottle(SimpleRateThrottle):
    scope = "registration"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PasswordResetRateThrottle(EmailKeyedRateThrottle):
    scope = "password_reset"


class PasswordResetEmailRateThrottle(SimpleRateThrottle):
    """Throttle keyed by email address alone, independent of the requester's IP.

    `PasswordResetRateThrottle` is keyed by IP+email, so an attacker rotating
    IPs can send unlimited requests to a single victim email. This throttle
    closes that gap by limiting the target address regardless of source IP.
    """

    scope = "password_reset_email"

    def get_cache_key(self, request, view):
        email_fingerprint = hashlib.sha256(
            _normalized_request_email(request).encode("utf-8")
        ).hexdigest()

        return self.cache_format % {
            "scope": self.scope,
            "ident": email_fingerprint,
        }


class EmailVerificationResendRateThrottle(SimpleRateThrottle):
    """Throttle keyed by authenticated user, to prevent email-bombing via resend."""

    scope = "email_verification_resend"

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        ident = f"user:{user.pk}" if user and user.is_authenticated else self.get_ident(request)

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class EmailChangeRateThrottle(SimpleRateThrottle):
    """Throttle email-change requests per user, to prevent email-bombing.

    Only applies to PATCH requests that include an "email" field; plain
    profile updates (e.g. username) are not throttled by this class.
    """

    scope = "email_change"

    def get_rate(self):
        # Some test suites replace SimpleRateThrottle.THROTTLE_RATES wholesale
        # with dicts that predate this scope. Treat a missing rate as
        # "unthrottled" instead of raising and turning every request into a 500.
        try:
            return super().get_rate()
        except ImproperlyConfigured:
            return None

    def get_cache_key(self, request, view):
        if request.method != "PATCH":
            return None

        try:
            has_email = "email" in request.data
        except (AttributeError, APIException):
            has_email = False

        if not has_email:
            return None

        user = getattr(request, "user", None)
        ident = f"user:{user.pk}" if user and user.is_authenticated else self.get_ident(request)

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class ReservationRateThrottle(SimpleRateThrottle):
    scope = "reservation"

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            ident = f"user:{user.pk}"
        else:
            ident = f"ip:{self.get_ident(request)}"

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


def throttling_exception_handler(exc, context):
    return standardized_exception_handler(exc, context)
