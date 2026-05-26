import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestHealthCheckApi:
    @pytest.fixture
    def api_client(self):
        return APIClient()

    def test_liveness_returns_200_for_process_health(self, api_client):
        response = api_client.get("/health/live/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {
            "status": "ok",
            "checks": {
                "process": "ok",
            },
        }

    def test_readiness_returns_200_when_core_api_dependencies_are_healthy(
        self,
        api_client,
        monkeypatch,
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
            lambda self: "unavailable",
        )

        response = api_client.get("/health/ready/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {
            "status": "ok",
            "checks": {
                "database": "ok",
                "redis": "ok",
            },
        }

    def test_legacy_health_endpoint_uses_readiness_policy(
        self,
        api_client,
        monkeypatch,
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
            lambda self: "unavailable",
        )

        response = api_client.get("/health/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {
            "status": "ok",
            "checks": {
                "database": "ok",
                "redis": "ok",
            },
        }

    def test_readiness_returns_503_when_database_is_unavailable(
        self,
        api_client,
        monkeypatch,
    ):
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_database",
            lambda self: "unavailable",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_redis",
            lambda self: "ok",
        )

        response = api_client.get("/health/ready/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {
            "status": "unhealthy",
            "checks": {
                "database": "unavailable",
                "redis": "ok",
            },
        }

    def test_readiness_returns_503_when_redis_is_unavailable(
        self,
        api_client,
        monkeypatch,
    ):
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_database",
            lambda self: "ok",
        )
        monkeypatch.setattr(
            "cineprime_api.health.HealthCheckService._check_redis",
            lambda self: "unavailable",
        )

        response = api_client.get("/health/ready/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {
            "status": "unhealthy",
            "checks": {
                "database": "ok",
                "redis": "unavailable",
            },
        }

    def test_deep_health_returns_503_when_celery_is_unavailable(
        self,
        api_client,
        monkeypatch,
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
            lambda self: "unavailable",
        )

        response = api_client.get("/health/deep/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {
            "status": "unhealthy",
            "checks": {
                "database": "ok",
                "redis": "ok",
                "celery": "unavailable",
            },
        }

    def test_deep_health_returns_200_when_all_dependencies_are_healthy(
        self,
        api_client,
        monkeypatch,
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

        response = api_client.get("/health/deep/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {
            "status": "ok",
            "checks": {
                "database": "ok",
                "redis": "ok",
                "celery": "ok",
            },
        }
