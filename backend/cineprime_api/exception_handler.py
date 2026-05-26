import logging

from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("cineprime.api.errors")


def _extract_correlation_id(request):
    if request is None:
        return None

    headers = getattr(request, "headers", None)
    if headers:
        correlation_id = headers.get("X-Correlation-ID")
        if correlation_id:
            return correlation_id

    meta = getattr(request, "META", {}) or {}
    return meta.get("HTTP_X_CORRELATION_ID") or meta.get("X_CORRELATION_ID")


def _to_primitive(value):
    if isinstance(value, dict):
        return {key: _to_primitive(item) for key, item in value.items()}

    if isinstance(value, (list, tuple)):
        return [_to_primitive(item) for item in value]

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    return str(value)


def _extract_detail_message(detail):
    if isinstance(detail, dict):
        detail_value = detail.get("detail")
        if isinstance(detail_value, str):
            return detail_value
        return None

    if isinstance(detail, str):
        return detail

    return None


def _map_error_code(exc, response_status):
    if isinstance(exc, ValidationError):
        return "VALIDATION_FAILED"

    if isinstance(exc, AuthenticationFailed):
        detail_message = _extract_detail_message(
            _to_primitive(getattr(exc, "detail", None))
        )
        if detail_message in {"Invalid credentials.", "User account is disabled."}:
            return "INVALID_CREDENTIALS"
        return "NOT_AUTHENTICATED"

    if isinstance(exc, NotAuthenticated):
        return "NOT_AUTHENTICATED"

    if isinstance(exc, PermissionDenied):
        return "PERMISSION_DENIED"

    if isinstance(exc, NotFound):
        return "RESOURCE_NOT_FOUND"

    if isinstance(exc, Throttled):
        return "THROTTLED"

    if isinstance(exc, APIException):
        default_code = getattr(exc, "default_code", "")
        if isinstance(default_code, str) and default_code.isupper():
            return default_code

    if response_status == status.HTTP_400_BAD_REQUEST:
        return "VALIDATION_FAILED"

    if response_status == status.HTTP_401_UNAUTHORIZED:
        return "NOT_AUTHENTICATED"

    if response_status == status.HTTP_403_FORBIDDEN:
        return "PERMISSION_DENIED"

    if response_status == status.HTTP_404_NOT_FOUND:
        return "RESOURCE_NOT_FOUND"

    if response_status == status.HTTP_429_TOO_MANY_REQUESTS:
        return "THROTTLED"

    return "INTERNAL_SERVER_ERROR"


def _build_message(error_code, detail_message, exc):
    if error_code == "VALIDATION_FAILED":
        return "Validation failed."

    if error_code == "THROTTLED":
        wait = getattr(exc, "wait", None)
        if wait:
            return f"Request limit exceeded. Please try again in {int(wait)} seconds."
        return "Request limit exceeded. Please try again later."

    if detail_message:
        return detail_message

    default_messages = {
        "INVALID_CREDENTIALS": "Invalid credentials.",
        "NOT_AUTHENTICATED": "Authentication credentials were not provided.",
        "PERMISSION_DENIED": "You do not have permission to perform this action.",
        "RESOURCE_NOT_FOUND": "Requested resource was not found.",
        "SEAT_ALREADY_RESERVED": "One or more selected seats are already reserved or purchased.",
        "INTERNAL_SERVER_ERROR": "Internal server error.",
    }

    return default_messages.get(error_code, "Request could not be processed.")


def _build_details(error_code, normalized_data, exc):
    if error_code == "VALIDATION_FAILED":
        if isinstance(normalized_data, dict):
            return normalized_data

        if isinstance(normalized_data, list):
            return {"non_field_errors": normalized_data}

        if normalized_data is not None:
            return {"detail": normalized_data}

        return {}

    if error_code == "THROTTLED":
        wait = getattr(exc, "wait", None)
        if wait:
            return {"retry_after_seconds": int(wait)}
        return {}

    if isinstance(normalized_data, dict):
        return {key: value for key, value in normalized_data.items() if key != "detail"}

    return {}


def standardized_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    request = context.get("request")
    view = context.get("view")
    correlation_id = _extract_correlation_id(request)
    view_name = None
    if view is not None:
        view_name = view.__class__.__name__

    if response is None:
        logger.exception(
            "Unhandled API exception",
            extra={
                "method": getattr(request, "method", None),
                "path": getattr(request, "path", None),
                "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                "correlation_id": correlation_id,
                "view_name": view_name,
            },
        )
        return Response(
            {
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "Internal server error.",
                    "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "details": {},
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        return Response(
            {
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "Internal server error.",
                    "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "details": {},
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    normalized_data = _to_primitive(response.data)
    error_code = _map_error_code(exc, response.status_code)
    detail_message = _extract_detail_message(normalized_data)
    message = _build_message(error_code, detail_message, exc)
    details = _build_details(error_code, normalized_data, exc)

    logger.warning(
        "API request failed",
        extra={
            "method": getattr(request, "method", None),
            "path": getattr(request, "path", None),
            "status_code": response.status_code,
            "error_code": error_code,
        },
    )

    return Response(
        {
            "error": {
                "code": error_code,
                "message": message,
                "status": response.status_code,
                "details": details,
            }
        },
        status=response.status_code,
    )
