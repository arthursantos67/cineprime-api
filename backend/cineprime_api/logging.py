import json
import logging
from datetime import datetime, UTC

from .logging_context import get_correlation_id, get_execution_context


class RequestContextFilter(logging.Filter):
    def filter(self, record):
        record.correlation_id = get_correlation_id()
        record.execution_context = get_execution_context()

        if not hasattr(record, "method"):
            record.method = None

        if not hasattr(record, "path"):
            record.path = None

        if not hasattr(record, "status_code"):
            record.status_code = None

        if not hasattr(record, "task_id"):
            record.task_id = None

        if not hasattr(record, "task_name"):
            record.task_name = None

        if not hasattr(record, "task_state"):
            record.task_state = None

        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": getattr(record, "correlation_id", None),
            "execution_context": getattr(record, "execution_context", None),
            "method": getattr(record, "method", None),
            "path": getattr(record, "path", None),
            "status_code": getattr(record, "status_code", None),
            "task_id": getattr(record, "task_id", None),
            "task_name": getattr(record, "task_name", None),
            "task_state": getattr(record, "task_state", None),
        }

        if record.exc_info:
            payload["stack_trace"] = self.formatException(record.exc_info)

        return json.dumps(
            {key: value for key, value in payload.items() if value is not None},
            default=str,
        )
