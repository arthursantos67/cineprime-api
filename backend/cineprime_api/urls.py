from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import deep_health_check, health_check, liveness_check, readiness_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("health/live/", liveness_check, name="health-live"),
    path("health/ready/", readiness_check, name="health-ready"),
    path("health/deep/", deep_health_check, name="health-deep"),
    path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="api-schema"),
        name="api-docs",
    ),
    path("api/v1/auth/", include("users.auth_urls")),
    path("api/v1/catalog/", include("catalog.urls")),
    path("api/v1/reservation/", include("reservations.urls")),
    path("api/v1/users/", include("users.urls")),
]
