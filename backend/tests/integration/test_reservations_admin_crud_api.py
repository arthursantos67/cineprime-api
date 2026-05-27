import pytest
from datetime import timedelta

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket
from reservations.views import (
    SeatDetailView,
    SeatListCreateView,
    SeatRowDetailView,
    SeatRowListCreateView,
    SessionSeatDetailView,
    SessionSeatListCreateView,
    TicketDetailView,
    TicketListCreateView,
)
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
    "EXCEPTION_HANDLER": "cineprime_api.exception_handler.standardized_exception_handler",
}


@pytest.fixture(autouse=True)
def disable_throttling_for_module():
    original_seat_row_list_throttles = SeatRowListCreateView.throttle_classes
    original_seat_row_detail_throttles = SeatRowDetailView.throttle_classes
    original_seat_list_throttles = SeatListCreateView.throttle_classes
    original_seat_detail_throttles = SeatDetailView.throttle_classes
    original_session_seat_list_throttles = SessionSeatListCreateView.throttle_classes
    original_session_seat_detail_throttles = SessionSeatDetailView.throttle_classes
    original_ticket_list_throttles = TicketListCreateView.throttle_classes
    original_ticket_detail_throttles = TicketDetailView.throttle_classes

    SeatRowListCreateView.throttle_classes = []
    SeatRowDetailView.throttle_classes = []
    SeatListCreateView.throttle_classes = []
    SeatDetailView.throttle_classes = []
    SessionSeatListCreateView.throttle_classes = []
    SessionSeatDetailView.throttle_classes = []
    TicketListCreateView.throttle_classes = []
    TicketDetailView.throttle_classes = []

    cache.clear()
    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield
    cache.clear()

    SeatRowListCreateView.throttle_classes = original_seat_row_list_throttles
    SeatRowDetailView.throttle_classes = original_seat_row_detail_throttles
    SeatListCreateView.throttle_classes = original_seat_list_throttles
    SeatDetailView.throttle_classes = original_seat_detail_throttles
    SessionSeatListCreateView.throttle_classes = original_session_seat_list_throttles
    SessionSeatDetailView.throttle_classes = original_session_seat_detail_throttles
    TicketListCreateView.throttle_classes = original_ticket_list_throttles
    TicketDetailView.throttle_classes = original_ticket_detail_throttles


@pytest.fixture
def admin_user():
    return User.objects.create_user(
        email="reservation-admin@example.com",
        username="reservation_admin",
        password="StrongPass123",
        is_staff=True,
    )


@pytest.fixture
def regular_user():
    return User.objects.create_user(
        email="reservation-user@example.com",
        username="reservation_user",
        password="StrongPass123",
    )


@pytest.fixture
def api_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def anonymous_api_client():
    return APIClient()


@pytest.fixture
def regular_api_client(regular_user):
    client = APIClient()
    client.force_authenticate(user=regular_user)
    return client


@pytest.fixture
def room():
    return Room.objects.create(name="Room CRUD", capacity=50)


@pytest.fixture
def movie():
    return Movie.objects.create(
        title="Movie CRUD",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-29",
        poster_url="https://example.com/movie-crud.jpg",
    )


@pytest.fixture
def session(movie, room):
    now = timezone.now()
    return Session.objects.create(
        movie=movie,
        room=room,
        start_time=now + timedelta(hours=1),
        end_time=now + timedelta(hours=3),
        base_price="30.00",
    )


@pytest.mark.django_db
def test_seat_row_create_retrieve_delete_endpoints(api_client, room):
    create_response = api_client.post(
        "/api/v1/reservation/seat-rows/",
        {"room": str(room.id), "name": "a"},
        format="json",
    )

    assert create_response.status_code == status.HTTP_201_CREATED
    seat_row_id = create_response.data["id"]
    assert create_response.data["name"] == "A"

    retrieve_response = api_client.get(
        f"/api/v1/reservation/seat-rows/{seat_row_id}/",
    )

    assert retrieve_response.status_code == status.HTTP_200_OK
    assert retrieve_response.data["name"] == "A"

    patch_response = api_client.patch(
        f"/api/v1/reservation/seat-rows/{seat_row_id}/",
        {"name": "b"},
        format="json",
    )

    assert patch_response.status_code == status.HTTP_200_OK
    assert patch_response.data["name"] == "B"

    delete_response = api_client.delete(f"/api/v1/reservation/seat-rows/{seat_row_id}/")

    assert delete_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_seat_create_retrieve_delete_endpoints(api_client, room):
    seat_row = SeatRow.objects.create(room=room, name="A")

    create_response = api_client.post(
        "/api/v1/reservation/seats/",
        {"row": str(seat_row.id), "number": 1},
        format="json",
    )

    assert create_response.status_code == status.HTTP_201_CREATED
    seat_id = create_response.data["id"]

    retrieve_response = api_client.get(
        f"/api/v1/reservation/seats/{seat_id}/",
    )

    assert retrieve_response.status_code == status.HTTP_200_OK
    assert retrieve_response.data["number"] == 1

    patch_response = api_client.patch(
        f"/api/v1/reservation/seats/{seat_id}/",
        {"number": 2},
        format="json",
    )

    assert patch_response.status_code == status.HTTP_200_OK
    assert patch_response.data["number"] == 2

    delete_response = api_client.delete(f"/api/v1/reservation/seats/{seat_id}/")

    assert delete_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_session_seat_create_retrieve_delete_endpoints(api_client, room, session):
    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)

    create_response = api_client.post(
        "/api/v1/reservation/session-seats/",
        {
            "session": str(session.id),
            "seat": str(seat.id),
            "status": SessionSeatStatus.PURCHASED,
            "locked_by_user": None,
            "lock_expires_at": None,
        },
        format="json",
    )

    assert create_response.status_code == status.HTTP_201_CREATED
    session_seat_id = create_response.data["id"]
    assert create_response.data["status"] == SessionSeatStatus.AVAILABLE

    retrieve_response = api_client.get(
        f"/api/v1/reservation/session-seats/{session_seat_id}/",
    )

    assert retrieve_response.status_code == status.HTTP_200_OK
    assert retrieve_response.data["status"] == SessionSeatStatus.AVAILABLE

    patch_response = api_client.patch(
        f"/api/v1/reservation/session-seats/{session_seat_id}/",
        {"status": SessionSeatStatus.PURCHASED},
        format="json",
    )

    assert patch_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    delete_response = api_client.delete(
        f"/api/v1/reservation/session-seats/{session_seat_id}/"
    )

    assert delete_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_ticket_list_retrieve_delete_endpoints(api_client, room, session):
    user = User.objects.create_user(
        email="ticket-crud@example.com",
        username="ticketcrud",
        password="StrongPass123",
    )
    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)

    session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat,
        status=SessionSeatStatus.PURCHASED,
    )

    ticket = Ticket.objects.create(
        user=user,
        session_seat=session_seat,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    retrieve_response = api_client.get(f"/api/v1/reservation/tickets/{ticket.id}/")

    assert retrieve_response.status_code == status.HTTP_200_OK
    assert retrieve_response.data["id"] == str(ticket.id)
    assert retrieve_response.data["ticket_code"]
    assert retrieve_response.data["ticket_type"] == "inteira"
    assert retrieve_response.data["amount_paid"] == "30.00"
    assert retrieve_response.data["payment_method"] == "pix"
    assert retrieve_response.data["movie"]["id"] == str(session.movie_id)
    assert retrieve_response.data["session"]["id"] == str(session.id)
    assert retrieve_response.data["room"]["id"] == str(room.id)
    assert retrieve_response.data["seat"]["identifier"] == "A1"

    list_response = api_client.get("/api/v1/reservation/tickets/")

    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.data["count"] == 1

    patch_response = api_client.patch(
        f"/api/v1/reservation/tickets/{ticket.id}/",
        {"user": str(user.id)},
        format="json",
    )

    assert patch_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    delete_response = api_client.delete(f"/api/v1/reservation/tickets/{ticket.id}/")

    assert delete_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_ticket_creation_endpoint_is_not_available_for_admins(
    api_client,
    room,
    session,
):
    user = User.objects.create_user(
        email="ticket-create-admin@example.com",
        username="ticket_create_admin",
        password="StrongPass123",
    )
    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)
    session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat,
        status=SessionSeatStatus.PURCHASED,
    )

    response = api_client.post(
        "/api/v1/reservation/tickets/",
        {
            "user": str(user.id),
            "session_seat": str(session_seat.id),
            "ticket_type": "inteira",
            "amount_paid": "30.00",
            "payment_method": "pix",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert Ticket.objects.count() == 0


@pytest.mark.django_db
def test_non_admin_users_cannot_mutate_reservation_admin_resources(
    regular_api_client,
    regular_user,
    room,
    session,
):
    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)
    session_seat = SessionSeat.objects.create(session=session, seat=seat)

    responses = [
        regular_api_client.post(
            "/api/v1/reservation/seat-rows/",
            {"room": str(room.id), "name": "B"},
            format="json",
        ),
        regular_api_client.patch(
            f"/api/v1/reservation/seat-rows/{seat_row.id}/",
            {"name": "C"},
            format="json",
        ),
        regular_api_client.delete(f"/api/v1/reservation/seats/{seat.id}/"),
        regular_api_client.post(
            "/api/v1/reservation/session-seats/",
            {
                "session": str(session.id),
                "seat": str(seat.id),
                "status": SessionSeatStatus.PURCHASED,
            },
            format="json",
        ),
        regular_api_client.patch(
            f"/api/v1/reservation/session-seats/{session_seat.id}/",
            {"status": SessionSeatStatus.PURCHASED},
            format="json",
        ),
        regular_api_client.post(
            "/api/v1/reservation/tickets/",
            {
                "user": str(regular_user.id),
                "session_seat": str(session_seat.id),
                "ticket_type": "inteira",
                "amount_paid": "30.00",
                "payment_method": "pix",
            },
            format="json",
        ),
    ]

    for response in responses:
        assert response.status_code == status.HTTP_403_FORBIDDEN

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.AVAILABLE
    assert Ticket.objects.count() == 0


@pytest.mark.django_db
def test_anonymous_users_cannot_mutate_reservation_admin_resources(
    anonymous_api_client,
    room,
    session,
):
    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)
    session_seat = SessionSeat.objects.create(session=session, seat=seat)

    responses = [
        anonymous_api_client.post(
            "/api/v1/reservation/seat-rows/",
            {"room": str(room.id), "name": "B"},
            format="json",
        ),
        anonymous_api_client.patch(
            f"/api/v1/reservation/seat-rows/{seat_row.id}/",
            {"name": "C"},
            format="json",
        ),
        anonymous_api_client.delete(f"/api/v1/reservation/seats/{seat.id}/"),
        anonymous_api_client.post(
            "/api/v1/reservation/session-seats/",
            {
                "session": str(session.id),
                "seat": str(seat.id),
                "status": SessionSeatStatus.PURCHASED,
            },
            format="json",
        ),
        anonymous_api_client.patch(
            f"/api/v1/reservation/session-seats/{session_seat.id}/",
            {"status": SessionSeatStatus.PURCHASED},
            format="json",
        ),
        anonymous_api_client.post(
            "/api/v1/reservation/tickets/",
            {
                "user": str(
                    User.objects.create_user(
                        email="anon-ticket-user@example.com",
                        username="anon_ticket_user",
                        password="StrongPass123",
                    ).id
                ),
                "session_seat": str(session_seat.id),
                "ticket_type": "inteira",
                "amount_paid": "30.00",
                "payment_method": "pix",
            },
            format="json",
        ),
    ]

    for response in responses:
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.AVAILABLE
    assert Ticket.objects.count() == 0
