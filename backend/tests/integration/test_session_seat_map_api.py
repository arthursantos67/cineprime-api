import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus
from users.models import User
from django.utils import timezone

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
    "EXCEPTION_HANDLER": "cineprime_natal_api.exception_handler.standardized_exception_handler",
}


@pytest.fixture(autouse=True)
def disable_throttling_for_module():
    from reservations.views import SessionSeatMapView

    original_session_seat_map_throttles = SessionSeatMapView.throttle_classes
    SessionSeatMapView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    SessionSeatMapView.throttle_classes = original_session_seat_map_throttles


@pytest.mark.django_db
def test_session_seat_map_returns_full_seat_map():
    client = APIClient()

    room = Room.objects.create(name="Room 1", capacity=100)
    row_a = SeatRow.objects.create(room=room, name="A")
    row_b = SeatRow.objects.create(room=room, name="B")

    seat_a1 = Seat.objects.create(row=row_a, number=1)
    seat_a2 = Seat.objects.create(row=row_a, number=2, is_accessible=True)
    seat_b1 = Seat.objects.create(row=row_b, number=1)

    movie = Movie.objects.create(
        title="Movie 1",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now(),
        end_time=timezone.now() + timezone.timedelta(hours=2),
        base_price="30.00",
    )

    session_seats = SessionSeat.objects.bulk_create(
        [
            SessionSeat(
                session=session, seat=seat_a1, status=SessionSeatStatus.AVAILABLE
            ),
            SessionSeat(
                session=session,
                seat=seat_a2,
                status=SessionSeatStatus.RESERVED,
                locked_by_user=User.objects.create_user(
                    email="u1@example.com", username="u1", password="StrongPass123"
                ),
                lock_expires_at=timezone.now() + timezone.timedelta(minutes=10),
            ),
            SessionSeat(
                session=session, seat=seat_b1, status=SessionSeatStatus.PURCHASED
            ),
        ]
    )

    response = client.get(f"/api/v1/reservation/sessions/{session.id}/seats/")

    assert response.status_code == 200
    assert response.data == [
        {
            "session_seat_id": str(session_seats[0].id),
            "seat_id": str(seat_a1.id),
            "row": "A",
            "number": 1,
            "status": "AVAILABLE",
            "is_accessible": False,
        },
        {
            "session_seat_id": str(session_seats[1].id),
            "seat_id": str(seat_a2.id),
            "row": "A",
            "number": 2,
            "status": "RESERVED",
            "is_accessible": True,
        },
        {
            "session_seat_id": str(session_seats[2].id),
            "seat_id": str(seat_b1.id),
            "row": "B",
            "number": 1,
            "status": "PURCHASED",
            "is_accessible": False,
        },
    ]
    assert "reserved_by_current_user" not in response.data[1]
    assert "lock_expires_at" not in response.data[1]


@pytest.mark.django_db
def test_authenticated_session_seat_map_identifies_current_user_reservations():
    client = APIClient()

    user = User.objects.create_user(
        email="owner@example.com",
        username="owner",
        password="StrongPass123",
    )
    other_user = User.objects.create_user(
        email="other@example.com",
        username="other",
        password="StrongPass123",
    )
    client.force_authenticate(user=user)

    room = Room.objects.create(name="Room 1", capacity=100)
    row = SeatRow.objects.create(room=room, name="A")
    seat_1 = Seat.objects.create(row=row, number=1)
    seat_2 = Seat.objects.create(row=row, number=2)

    movie = Movie.objects.create(
        title="Movie 2",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now(),
        end_time=timezone.now() + timezone.timedelta(hours=2),
        base_price="30.00",
    )

    owner_expires_at = timezone.now() + timezone.timedelta(minutes=10)
    own_session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat_1,
        status=SessionSeatStatus.RESERVED,
        locked_by_user=user,
        lock_expires_at=owner_expires_at,
    )
    other_session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat_2,
        status=SessionSeatStatus.RESERVED,
        locked_by_user=other_user,
        lock_expires_at=timezone.now() + timezone.timedelta(minutes=10),
    )

    response = client.get(f"/api/v1/reservation/sessions/{session.id}/seats/")

    assert response.status_code == 200
    assert response.data[0]["session_seat_id"] == str(own_session_seat.id)
    assert response.data[0]["reserved_by_current_user"] is True
    assert response.data[0]["lock_expires_at"] is not None
    assert response.data[1]["session_seat_id"] == str(other_session_seat.id)
    assert response.data[1]["reserved_by_current_user"] is False
    assert response.data[1]["lock_expires_at"] is None


@pytest.mark.django_db
def test_session_seat_map_is_publicly_accessible():
    client = APIClient()

    room = Room.objects.create(name="Room 1", capacity=100)
    row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=1)

    movie = Movie.objects.create(
        title="Movie 1",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now(),
        end_time=timezone.now() + timezone.timedelta(hours=2),
        base_price="30.00",
    )

    SessionSeat.objects.create(session=session, seat=seat)

    response = client.get(f"/api/v1/reservation/sessions/{session.id}/seats/")

    assert response.status_code == 200


@pytest.mark.django_db
def test_session_seat_map_returns_404_for_unknown_session():
    client = APIClient()

    response = client.get(
        "/api/v1/reservation/sessions/00000000-0000-0000-0000-000000000000/seats/"
    )

    assert response.status_code == 404
