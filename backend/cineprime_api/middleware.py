import logging
import uuid

from .logging_context import (
    reset_correlation_id,
    reset_execution_context,
    set_correlation_id,
    set_execution_context,
)

CORRELATION_ID_HEADER = "X-Correlation-ID"

logger = logging.getLogger("cineprime.observability")


class CorrelationIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        correlation_id = request.headers.get(CORRELATION_ID_HEADER) or str(uuid.uuid4())
        request.correlation_id = correlation_id

        correlation_token = set_correlation_id(correlation_id)
        execution_token = set_execution_context("api")

        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                "Unhandled request error",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status_code": 500,
                },
            )
            raise
        else:
            logger.info(
                "Request completed",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                },
            )
            response[CORRELATION_ID_HEADER] = correlation_id
            return response
        finally:
            reset_correlation_id(correlation_token)
            reset_execution_context(execution_token)
