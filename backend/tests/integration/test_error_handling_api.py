from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from catalog.models import Genre, Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus

User = get_user_model()


REST_FRAMEWORK_OVERRIDE = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
    "EXCEPTION_HANDLER": "cineprime_api.exception_handler.standardized_exception_handler",
}


@pytest.fixture(autouse=True)
def disable_throttling_for_module(request):
    from catalog.views import GenreListCreateView, MovieDetailView
    from reservations.views import CheckoutView, TemporarySeatReservationView
    from users.views import CurrentUserView, UserLoginView

    if request.node.name == "test_error_schema_for_429_throttled":
        with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
            yield
        return

    original_genre_throttles = GenreListCreateView.throttle_classes
    original_movie_detail_throttles = MovieDetailView.throttle_classes
    original_login_throttles = UserLoginView.throttle_classes
    original_current_user_throttles = CurrentUserView.throttle_classes
    original_temp_reservation_throttles = TemporarySeatReservationView.throttle_classes
    original_checkout_throttles = CheckoutView.throttle_classes

    GenreListCreateView.throttle_classes = []
    MovieDetailView.throttle_classes = []
    UserLoginView.throttle_classes = []
    CurrentUserView.throttle_classes = []
    TemporarySeatReservationView.throttle_classes = []
    CheckoutView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    GenreListCreateView.throttle_classes = original_genre_throttles
    MovieDetailView.throttle_classes = original_movie_detail_throttles
    UserLoginView.throttle_classes = original_login_throttles
    CurrentUserView.throttle_classes = original_current_user_throttles
    TemporarySeatReservationView.throttle_classes = original_temp_reservation_throttles
    CheckoutView.throttle_classes = original_checkout_throttles


@pytest.fixture
def api_client():
    return APIClient()


def _sync_throttle_rates_from_settings():
    from django.conf import settings

    SimpleRateThrottle.THROTTLE_RATES = settings.REST_FRAMEWORK.get(
        "DEFAULT_THROTTLE_RATES",
        {},
    )


def _create_session_with_single_seat(movie_title="Error Handling Movie"):
    genre = Genre.objects.create(name=f"Action-{movie_title}")
    movie = Movie.objects.create(
        title=movie_title,
        synopsis="Synopsis",
        duration_minutes=120,
        release_date=timezone.now().date(),
        poster_url="https://example.com/poster.jpg",
    )
    movie.genres.set([genre])

    room = Room.objects.create(name=f"Room-{movie_title}", capacity=20)
    row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=1)

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() + timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=3),
        base_price="30.00",
    )

    session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat,
        status=SessionSeatStatus.AVAILABLE,
    )

    return session, session_seat


@pytest.mark.django_db
def test_error_schema_for_400_validation_error(api_client):
    response = api_client.post("/api/v1/auth/login/", {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert response.data["error"]["message"] == "Validation failed."
    assert "email" in response.data["error"]["details"]


@pytest.mark.django_db
def test_error_schema_for_401_not_authenticated(api_client):
    response = api_client.get("/api/v1/users/me/")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.data["error"]["code"] == "NOT_AUTHENTICATED"
    assert response.data["error"]["status"] == 401
    assert isinstance(response.data["error"]["details"], dict)


@pytest.mark.django_db
def test_error_schema_for_403_permission_denied(api_client):
    owner = User.objects.create_user(
        email="owner-error@example.com",
        username="owner-error",
        password="StrongPass123!",
    )
    another_user = User.objects.create_user(
        email="another-error@example.com",
        username="another-error",
        password="StrongPass123!",
    )

    session, session_seat = _create_session_with_single_seat(
        movie_title="Permission Movie"
    )

    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = owner
    session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat.save(update_fields=["status", "locked_by_user", "lock_expires_at"])

    api_client.force_authenticate(user=another_user)
    response = api_client.post(
        "/api/v1/reservation/checkout/",
        {
            "seats": [
                {
                    "session_seat_id": str(session_seat.id),
                    "ticket_type": "inteira",
                }
            ],
            "payment_method": "pix",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data["error"]["code"] == "PERMISSION_DENIED"
    assert response.data["error"]["status"] == 403


@pytest.mark.django_db
def test_error_schema_for_404_not_found(api_client):
    response = api_client.get(
        "/api/v1/catalog/movies/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert response.data["error"]["status"] == 404


@pytest.mark.django_db
def test_error_schema_for_409_conflict(api_client):
    owner = User.objects.create_user(
        email="owner-conflict@example.com",
        username="owner-conflict",
        password="StrongPass123!",
    )
    requester = User.objects.create_user(
        email="requester-conflict@example.com",
        username="requester-conflict",
        password="StrongPass123!",
    )

    session, session_seat = _create_session_with_single_seat(
        movie_title="Conflict Movie"
    )

    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = owner
    session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat.save(update_fields=["status", "locked_by_user", "lock_expires_at"])

    api_client.force_authenticate(user=requester)
    response = api_client.post(
        f"/api/v1/reservation/sessions/{session.id}/reservations/",
        {"seat_ids": [str(session_seat.seat_id)]},
        format="json",
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data["error"]["code"] == "SEAT_ALREADY_RESERVED"
    assert response.data["error"]["status"] == 409


@pytest.mark.django_db
@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_PERMISSION_CLASSES": [
            "rest_framework.permissions.AllowAny",
        ],
        "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
        "PAGE_SIZE": 10,
        "DEFAULT_THROTTLE_CLASSES": [
            "cineprime_api.throttling.GlobalAnonRateThrottle",
            "cineprime_api.throttling.GlobalUserRateThrottle",
        ],
        "DEFAULT_THROTTLE_RATES": {
            "anon": "2/minute",
            "user": "2/minute",
            "login": "5/minute",
            "reservation": "10/minute",
        },
        "EXCEPTION_HANDLER": "cineprime_api.exception_handler.standardized_exception_handler",
    }
)
def test_error_schema_for_429_throttled(api_client):
    cache.clear()
    _sync_throttle_rates_from_settings()

    api_client.get("/api/v1/catalog/genres/")
    api_client.get("/api/v1/catalog/genres/")
    response = api_client.get("/api/v1/catalog/genres/")

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.data["error"]["code"] == "THROTTLED"
    assert response.data["error"]["status"] == 429
    assert "Request limit exceeded" in response.data["error"]["message"]


@pytest.mark.django_db
def test_error_schema_for_500_internal_server_error(api_client, monkeypatch):
    from catalog.views import GenreListCreateView

    def raise_unexpected_error(*args, **kwargs):
        raise RuntimeError("unexpected internal failure")

    monkeypatch.setattr(GenreListCreateView, "list", raise_unexpected_error)

    response = api_client.get("/api/v1/catalog/genres/")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert response.data["error"]["status"] == 500
    assert response.data["error"]["message"] == "Internal server error."
    assert response.data["error"]["details"] == {}
    assert "Traceback" not in str(response.data)
    assert "RuntimeError" not in str(response.data)
    assert "unexpected internal failure" not in str(response.data)


@pytest.mark.django_db
def test_unexpected_500_logs_structured_context(api_client, monkeypatch):
    from cineprime_api import exception_handler as handler_module
    from catalog.views import GenreListCreateView

    def raise_unexpected_error(*args, **kwargs):
        raise RuntimeError("unexpected internal failure")

    captured = {}

    def fake_logger_exception(message, extra=None):
        captured["message"] = message
        captured["extra"] = extra

    monkeypatch.setattr(GenreListCreateView, "list", raise_unexpected_error)
    monkeypatch.setattr(handler_module.logger, "exception", fake_logger_exception)

    response = api_client.get(
        "/api/v1/catalog/genres/",
        HTTP_X_CORRELATION_ID="corr-test-123",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert captured["message"] == "Unhandled API exception"
    assert captured["extra"]["path"] == "/api/v1/catalog/genres/"
    assert captured["extra"]["method"] == "GET"
    assert captured["extra"]["status_code"] == 500
    assert captured["extra"]["correlation_id"] == "corr-test-123"
    assert captured["extra"]["view_name"] == "GenreListCreateView"
