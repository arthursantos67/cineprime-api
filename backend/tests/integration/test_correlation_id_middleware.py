import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestCorrelationIdMiddleware:
    @pytest.fixture
    def api_client(self):
        return APIClient()

    def test_generates_correlation_id_when_header_is_missing(
        self, api_client, monkeypatch
    ):
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_database",
            lambda self: "ok",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_redis",
            lambda self: "ok",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_celery",
            lambda self: "ok",
        )

        response = api_client.get("/health/")

        assert response.status_code == status.HTTP_200_OK
        assert "X-Correlation-ID" in response
        assert response["X-Correlation-ID"]

    def test_reuses_incoming_correlation_id_header(self, api_client, monkeypatch):
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_database",
            lambda self: "ok",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_redis",
            lambda self: "ok",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_celery",
            lambda self: "ok",
        )

        correlation_id = "test-correlation-id-123"

        response = api_client.get(
            "/health/",
            HTTP_X_CORRELATION_ID=correlation_id,
        )

        assert response.status_code == status.HTTP_200_OK
        assert response["X-Correlation-ID"] == correlation_id
