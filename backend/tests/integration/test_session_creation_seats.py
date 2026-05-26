import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat
from users.models import User

REST_FRAMEWORK_OVERRIDE = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
    "EXCEPTION_HANDLER": "cineprime_natal_api.exception_handler.standardized_exception_handler",
}


@pytest.fixture(autouse=True)
def disable_throttling_for_module():
    from catalog.views import SessionListCreateView

    original_session_list_create_throttles = SessionListCreateView.throttle_classes
    SessionListCreateView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    SessionListCreateView.throttle_classes = original_session_list_create_throttles


@pytest.mark.django_db
def test_creating_session_auto_generates_session_seats():
    client = APIClient()
    admin_user = User.objects.create_user(
        email="session-admin@example.com",
        username="session_admin",
        password="StrongPass123",
        is_staff=True,
    )
    client.force_authenticate(user=admin_user)

    room = Room.objects.create(name="Room 1", capacity=100)
    row_a = SeatRow.objects.create(room=room, name="A")
    row_b = SeatRow.objects.create(room=room, name="B")

    seat_a1 = Seat.objects.create(row=row_a, number=1)
    seat_a2 = Seat.objects.create(row=row_a, number=2)
    seat_b1 = Seat.objects.create(row=row_b, number=1)

    movie = Movie.objects.create(
        title="Movie 1",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    response = client.post(
        "/api/v1/catalog/sessions/",
        {
            "movie": str(movie.id),
            "room": str(room.id),
            "start_time": "2026-03-22T18:00:00Z",
            "end_time": "2026-03-22T20:00:00Z",
            "base_price": "30.00",
        },
        format="json",
    )

    assert response.status_code == 201

    session = Session.objects.get(id=response.data["id"])

    session_seats = SessionSeat.objects.filter(session=session).order_by(
        "seat__row__name", "seat__number"
    )

    assert session_seats.count() == 3
    assert list(session_seats.values_list("seat_id", flat=True)) == [
        seat_a1.id,
        seat_a2.id,
        seat_b1.id,
    ]
