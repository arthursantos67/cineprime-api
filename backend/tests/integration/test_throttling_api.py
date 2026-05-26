import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIClient
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def _sync_throttle_rates_from_settings():
    SimpleRateThrottle.THROTTLE_RATES = settings.REST_FRAMEWORK.get(
        "DEFAULT_THROTTLE_RATES",
        {},
    )


@pytest.fixture(autouse=True)
def isolate_throttling_state():
    from catalog.views import GenreListCreateView
    from cineprime_natal_api.throttling import (
        GlobalAnonRateThrottle,
        GlobalUserRateThrottle,
        LoginRateThrottle,
        ReservationRateThrottle,
    )
    from reservations.views import CheckoutView, TemporarySeatReservationView
    from users.views import UserLoginView

    original_genre_throttles = getattr(GenreListCreateView, "throttle_classes", None)
    original_login_throttles = UserLoginView.throttle_classes
    original_temp_reservation_throttles = TemporarySeatReservationView.throttle_classes
    original_checkout_throttles = CheckoutView.throttle_classes
    original_simple_rate_throttle_rates = SimpleRateThrottle.THROTTLE_RATES

    GenreListCreateView.throttle_classes = [
        GlobalAnonRateThrottle,
        GlobalUserRateThrottle,
    ]
    UserLoginView.throttle_classes = [LoginRateThrottle]
    TemporarySeatReservationView.throttle_classes = [ReservationRateThrottle]
    CheckoutView.throttle_classes = [ReservationRateThrottle]

    cache.clear()
    yield
    cache.clear()

    if original_genre_throttles is None:
        delattr(GenreListCreateView, "throttle_classes")
    else:
        GenreListCreateView.throttle_classes = original_genre_throttles
    UserLoginView.throttle_classes = original_login_throttles
    TemporarySeatReservationView.throttle_classes = original_temp_reservation_throttles
    CheckoutView.throttle_classes = original_checkout_throttles
    SimpleRateThrottle.THROTTLE_RATES = original_simple_rate_throttle_rates


@pytest.mark.django_db
class TestApiThrottling:
    @pytest.fixture
    def api_client(self):
        client = APIClient()
        client.defaults["REMOTE_ADDR"] = "10.10.10.10"
        return client

    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            email="user@example.com",
            username="testuser",
            password="StrongPass123!",
        )

    @pytest.fixture
    def authenticated_client(self, user):
        client = APIClient()
        client.defaults["REMOTE_ADDR"] = "10.10.10.11"
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        return client

    @pytest.fixture
    def session_with_seats(self):
        from catalog.models import Genre, Movie, Room, Session
        from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus
        from datetime import timedelta

        genre = Genre.objects.create(name="Action")
        movie = Movie.objects.create(
            title="Throttle Test Movie",
            synopsis="Test synopsis",
            duration_minutes=120,
            release_date=timezone.now().date(),
            poster_url="https://example.com/throttle-test.jpg",
        )
        movie.genres.set([genre])

        room = Room.objects.create(name="Room 1", capacity=20)
        row = SeatRow.objects.create(room=room, name="A")
        seat_1 = Seat.objects.create(row=row, number=1)
        seat_2 = Seat.objects.create(row=row, number=2)
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() + timedelta(days=1),
            end_time=timezone.now() + timedelta(days=1, hours=2),
            base_price="30.00",
        )
        SessionSeat.objects.create(
            session=session,
            seat=seat_1,
            status=SessionSeatStatus.AVAILABLE,
        )
        SessionSeat.objects.create(
            session=session,
            seat=seat_2,
            status=SessionSeatStatus.AVAILABLE,
        )

        return {
            "session": session,
            "seat_1": seat_1,
            "seat_2": seat_2,
        }

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
                "cineprime_natal_api.throttling.GlobalAnonRateThrottle",
                "cineprime_natal_api.throttling.GlobalUserRateThrottle",
            ],
            "DEFAULT_THROTTLE_RATES": {
                "anon": "2/minute",
                "user": "2/minute",
                "login": "1/minute",
                "reservation": "1/minute",
            },
            "EXCEPTION_HANDLER": "cineprime_natal_api.throttling.throttling_exception_handler",
        }
    )
    def test_global_anonymous_throttling_blocks_after_limit(
        self, api_client, monkeypatch
    ):
        _sync_throttle_rates_from_settings()

        first_response = api_client.get("/api/v1/catalog/genres/")
        second_response = api_client.get("/api/v1/catalog/genres/")
        third_response = api_client.get("/api/v1/catalog/genres/")

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_200_OK
        assert third_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        body = third_response.json()
        assert body["error"]["code"] == "THROTTLED"
        assert body["error"]["status"] == 429
        assert "Request limit exceeded" in body["error"]["message"]

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
                "cineprime_natal_api.throttling.GlobalAnonRateThrottle",
                "cineprime_natal_api.throttling.GlobalUserRateThrottle",
            ],
            "DEFAULT_THROTTLE_RATES": {
                "anon": "10/minute",
                "user": "10/minute",
                "login": "1/minute",
                "reservation": "10/minute",
            },
            "EXCEPTION_HANDLER": "cineprime_natal_api.throttling.throttling_exception_handler",
        }
    )
    def test_login_endpoint_is_throttled_faster_than_global_limit(self, api_client):
        _sync_throttle_rates_from_settings()

        payload = {
            "email": "user@example.com",
            "password": "wrong-password",
        }

        first_response = api_client.post("/api/v1/auth/login/", payload, format="json")
        second_response = api_client.post("/api/v1/auth/login/", payload, format="json")

        assert first_response.status_code in {
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED,
        }
        assert second_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        body = second_response.json()
        assert body["error"]["code"] == "THROTTLED"
        assert body["error"]["status"] == 429
        assert "Request limit exceeded" in body["error"]["message"]

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
                "cineprime_natal_api.throttling.GlobalAnonRateThrottle",
                "cineprime_natal_api.throttling.GlobalUserRateThrottle",
            ],
            "DEFAULT_THROTTLE_RATES": {
                "anon": "10/minute",
                "user": "10/minute",
                "login": "10/minute",
                "reservation": "1/minute",
            },
            "EXCEPTION_HANDLER": "cineprime_natal_api.throttling.throttling_exception_handler",
        }
    )
    def test_reservation_endpoint_is_throttled_with_specific_limit(
        self,
        authenticated_client,
        session_with_seats,
    ):
        _sync_throttle_rates_from_settings()

        session = session_with_seats["session"]
        seat_1 = session_with_seats["seat_1"]
        seat_2 = session_with_seats["seat_2"]

        first_payload = {
            "seat_ids": [str(seat_1.id)],
        }
        second_payload = {
            "seat_ids": [str(seat_2.id)],
        }

        first_response = authenticated_client.post(
            f"/api/v1/reservation/sessions/{session.id}/reservations/",
            first_payload,
            format="json",
        )
        second_response = authenticated_client.post(
            f"/api/v1/reservation/sessions/{session.id}/reservations/",
            second_payload,
            format="json",
        )

        assert first_response.status_code == status.HTTP_201_CREATED
        assert second_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        body = second_response.json()
        assert body["error"]["code"] == "THROTTLED"
        assert body["error"]["status"] == 429
        assert "Request limit exceeded" in body["error"]["message"]

    def test_login_throttle_key_combines_ip_with_normalized_email(self):
        from cineprime_natal_api.throttling import LoginRateThrottle

        factory = APIRequestFactory()
        throttle = LoginRateThrottle()
        first_request = Request(
            factory.post(
                "/api/v1/auth/login/",
                {"email": "USER@Example.COM", "password": "wrong-password"},
                format="json",
                REMOTE_ADDR="198.51.100.10",
            ),
            parsers=[JSONParser()],
        )
        second_request = Request(
            factory.post(
                "/api/v1/auth/login/",
                {"email": "user@example.com", "password": "wrong-password"},
                format="json",
                REMOTE_ADDR="198.51.100.10",
            ),
            parsers=[JSONParser()],
        )
        other_email_request = Request(
            factory.post(
                "/api/v1/auth/login/",
                {"email": "other@example.com", "password": "wrong-password"},
                format="json",
                REMOTE_ADDR="198.51.100.10",
            ),
            parsers=[JSONParser()],
        )

        first_key = throttle.get_cache_key(first_request, view=None)
        second_key = throttle.get_cache_key(second_request, view=None)
        other_email_key = throttle.get_cache_key(other_email_request, view=None)

        assert first_key == second_key
        assert first_key != other_email_key
        assert "user@example.com" not in first_key

    def test_reservation_throttle_key_uses_authenticated_user(self, user):
        from cineprime_natal_api.throttling import ReservationRateThrottle

        factory = APIRequestFactory()
        throttle = ReservationRateThrottle()
        request = factory.post(
            "/api/v1/reservation/sessions/session-id/reservations/",
            {"seat_ids": ["seat-id"]},
            format="json",
            REMOTE_ADDR="198.51.100.10",
        )
        request.user = user

        key = throttle.get_cache_key(request, view=None)

        assert key == f"throttle_reservation_user:{user.pk}"
        assert "198.51.100.10" not in key

    def test_reservation_throttle_key_falls_back_to_ip_for_anonymous_requests(self):
        from cineprime_natal_api.throttling import ReservationRateThrottle

        factory = APIRequestFactory()
        throttle = ReservationRateThrottle()
        request = factory.post(
            "/api/v1/reservation/sessions/session-id/reservations/",
            {"seat_ids": ["seat-id"]},
            format="json",
            REMOTE_ADDR="198.51.100.10",
        )
        request.user = AnonymousUser()

        key = throttle.get_cache_key(request, view=None)

        assert key == "throttle_reservation_ip:198.51.100.10"
