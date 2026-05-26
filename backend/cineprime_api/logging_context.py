from contextvars import ContextVar

_correlation_id = ContextVar("correlation_id", default=None)
_execution_context = ContextVar("execution_context", default="api")


def get_correlation_id():
    return _correlation_id.get()


def set_correlation_id(value):
    return _correlation_id.set(value)


def reset_correlation_id(token):
    _correlation_id.reset(token)


def get_execution_context():
    return _execution_context.get()


def set_execution_context(value):
    return _execution_context.set(value)


def reset_execution_context(token):
    _execution_context.reset(token)
