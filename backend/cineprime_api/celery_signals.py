import logging

from celery.signals import task_failure, task_postrun, task_prerun

from .logging_context import (
    reset_correlation_id,
    reset_execution_context,
    set_correlation_id,
    set_execution_context,
)

logger = logging.getLogger("cineprime.observability")
_task_context_tokens = {}


@task_prerun.connect
def on_task_prerun(task_id=None, task=None, *args, **kwargs):
    headers = getattr(task.request, "headers", None) or {}
    correlation_id = None

    if isinstance(headers, dict):
        correlation_id = headers.get("correlation_id")

    correlation_token = set_correlation_id(correlation_id)
    execution_token = set_execution_context("celery")

    _task_context_tokens[task_id] = (correlation_token, execution_token)

    logger.info(
        "Celery task started",
        extra={
            "task_id": task_id,
            "task_name": task.name if task else None,
            "task_state": "STARTED",
        },
    )


@task_postrun.connect
def on_task_postrun(task_id=None, task=None, state=None, *args, **kwargs):
    logger.info(
        "Celery task finished",
        extra={
            "task_id": task_id,
            "task_name": task.name if task else None,
            "task_state": state,
        },
    )

    tokens = _task_context_tokens.pop(task_id, None)
    if tokens:
        correlation_token, execution_token = tokens
        reset_correlation_id(correlation_token)
        reset_execution_context(execution_token)


@task_failure.connect
def on_task_failure(
    task_id=None,
    exception=None,
    traceback=None,
    sender=None,
    einfo=None,
    *args,
    **kwargs
):
    logger.exception(
        "Celery task failed",
        exc_info=(type(exception), exception, traceback) if exception else None,
        extra={
            "task_id": task_id,
            "task_name": sender.name if sender else None,
            "task_state": "FAILURE",
        },
    )
