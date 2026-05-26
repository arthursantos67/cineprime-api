import hashlib

from rest_framework.throttling import (
    AnonRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)
from rest_framework.exceptions import APIException

from cineprime_natal_api.exception_handler import standardized_exception_handler


class GlobalAnonRateThrottle(AnonRateThrottle):
    scope = "anon"


class GlobalUserRateThrottle(UserRateThrottle):
    scope = "user"


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        try:
            request_data = request.data
        except (AttributeError, APIException):
            request_data = getattr(request, "POST", {})
        email = request_data.get("email", "")
        normalized_email = str(email).strip().lower()
        email_fingerprint = hashlib.sha256(normalized_email.encode("utf-8")).hexdigest()
        throttle_ident = f"{ident}:{email_fingerprint}"

        return self.cache_format % {
            "scope": self.scope,
            "ident": throttle_ident,
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
