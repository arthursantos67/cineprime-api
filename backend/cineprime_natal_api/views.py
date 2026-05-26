from django.http import JsonResponse

from .health import HealthCheckService


def _health_response(result):
    status_code = 200 if result["status"] == "ok" else 503
    return JsonResponse(result, status=status_code)


def health_check(request):
    return readiness_check(request)


def liveness_check(request):
    result = HealthCheckService().liveness()
    return _health_response(result)


def readiness_check(request):
    result = HealthCheckService().readiness()
    return _health_response(result)


def deep_health_check(request):
    result = HealthCheckService().deep()
    return _health_response(result)
