import pytest
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import Ticket, SessionSeat, SessionSeatStatus, Seat, SeatRow


@pytest.mark.django_db
def test_should_return_only_authenticated_user_tickets():
    user_model = get_user_model()

    user1 = user_model.objects.create_user(
        email="user1@test.com",
        username="user1",
        password="123456",
    )

    user2 = user_model.objects.create_user(
        email="user2@test.com",
        username="user2",
        password="123456",
    )

    client = APIClient()
    client.force_authenticate(user=user1)

    room = Room.objects.create(name="Room", capacity=100)
    row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=1)

    movie = Movie.objects.create(
        title="Movie",
        synopsis="...",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="http://test.com",
        ticket_image_url="https://cdn.example.com/ticket-bg.jpg",
        translations={"en-US": {"title": "Localized Movie"}},
    )

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() + timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=2),
        base_price="30.00",
        projection_format="3d",
        audio_format="legendado",
    )

    session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat,
        status=SessionSeatStatus.PURCHASED,
    )

    ticket = Ticket.objects.create(
        user=user1,
        session_seat=session_seat,
        ticket_type="meia",
        amount_paid="15.00",
        payment_method="cartao_credito",
    )

    # Ticket de outro usuário (não deve aparecer)
    session_seat_2 = SessionSeat.objects.create(
        session=session,
        seat=Seat.objects.create(row=row, number=2),
        status=SessionSeatStatus.PURCHASED,
    )
    Ticket.objects.create(
        user=user2,
        session_seat=session_seat_2,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    response = client.get("/api/v1/users/me/tickets/")

    assert response.status_code == 200
    assert response.data["count"] == 1

    ticket_payload = response.data["results"][0]
    assert ticket_payload["ticket_id"] == str(ticket.id)
    assert ticket_payload["ticket_code"] == ticket.ticket_code
    assert ticket_payload["ticket_type"] == "meia"
    assert ticket_payload["amount_paid"] == "15.00"
    assert ticket_payload["payment_method"] == "cartao_credito"
    assert ticket_payload["session"]["id"] == str(session.id)
    assert ticket_payload["session"]["start_time"] is not None
    assert ticket_payload["session"]["end_time"] is not None
    assert ticket_payload["session"]["projection_format"] == "3d"
    assert ticket_payload["session"]["audio_format"] == "legendado"
    assert ticket_payload["room"] == {
        "id": str(room.id),
        "name": room.name,
    }
    assert ticket_payload["movie"] == {
        "id": str(movie.id),
        "title": movie.title,
        "poster_url": movie.poster_url,
        "ticket_image_url": movie.ticket_image_url,
    }

    # The movie title is localized from the request locale (Accept-Language).
    localized_response = client.get(
        "/api/v1/users/me/tickets/", HTTP_ACCEPT_LANGUAGE="en-US"
    )
    assert (
        localized_response.data["results"][0]["movie"]["title"] == "Localized Movie"
    )
    assert ticket_payload["seat"] == {
        "id": str(seat.id),
        "row": row.name,
        "number": seat.number,
        "identifier": "A1",
    }


@pytest.mark.django_db
def test_should_return_only_upcoming_tickets():
    user = get_user_model().objects.create_user(
        email="user@test.com",
        username="user",
        password="123456",
    )

    client = APIClient()
    client.force_authenticate(user=user)

    room = Room.objects.create(name="Room", capacity=100)
    row = SeatRow.objects.create(room=room, name="A")

    movie = Movie.objects.create(
        title="Movie",
        synopsis="...",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="http://test.com",
    )

    # FUTURE session
    future_session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() + timedelta(days=1),
        end_time=timezone.now() + timedelta(days=1, hours=2),
        base_price="30.00",
    )

    seat1 = Seat.objects.create(row=row, number=1)
    ss1 = SessionSeat.objects.create(
        session=future_session,
        seat=seat1,
        status=SessionSeatStatus.PURCHASED,
    )
    Ticket.objects.create(
        user=user,
        session_seat=ss1,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    # PAST session
    past_session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() - timedelta(days=1),
        end_time=timezone.now() - timedelta(hours=1),
        base_price="30.00",
    )

    seat2 = Seat.objects.create(row=row, number=2)
    ss2 = SessionSeat.objects.create(
        session=past_session,
        seat=seat2,
        status=SessionSeatStatus.PURCHASED,
    )
    Ticket.objects.create(
        user=user,
        session_seat=ss2,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    response = client.get("/api/v1/users/me/tickets/?type=upcoming")

    assert response.status_code == 200
    assert response.data["count"] == 1
    ticket_payload = response.data["results"][0]
    assert ticket_payload["session"]["id"] == str(future_session.id)
    assert ticket_payload["room"]["name"] == room.name
    assert ticket_payload["movie"]["poster_url"] == movie.poster_url
    assert ticket_payload["seat"]["identifier"] == "A1"


@pytest.mark.django_db
def test_should_return_only_past_tickets():
    user = get_user_model().objects.create_user(
        email="user@test.com",
        username="user",
        password="123456",
    )

    client = APIClient()
    client.force_authenticate(user=user)

    room = Room.objects.create(name="Room", capacity=100)
    row = SeatRow.objects.create(room=room, name="A")

    movie = Movie.objects.create(
        title="Movie",
        synopsis="...",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="http://test.com",
    )

    past_session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() - timedelta(days=1),
        end_time=timezone.now() - timedelta(hours=1),
        base_price="30.00",
    )

    seat = Seat.objects.create(row=row, number=1)
    ss = SessionSeat.objects.create(
        session=past_session,
        seat=seat,
        status=SessionSeatStatus.PURCHASED,
    )
    Ticket.objects.create(
        user=user,
        session_seat=ss,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    response = client.get("/api/v1/users/me/tickets/?type=past")

    assert response.status_code == 200
    assert response.data["count"] == 1
    ticket_payload = response.data["results"][0]
    assert ticket_payload["session"]["id"] == str(past_session.id)
    assert ticket_payload["room"]["name"] == room.name
    assert ticket_payload["movie"]["title"] == movie.title
    assert ticket_payload["seat"]["identifier"] == "A1"


@pytest.mark.django_db
def test_should_reject_invalid_ticket_type_filter_with_standard_error():
    user = get_user_model().objects.create_user(
        email="user@test.com",
        username="user",
        password="123456",
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/v1/users/me/tickets/?type=archived")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["message"] == "Validation failed."
    assert response.data["error"]["status"] == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["details"] == {
        "type": ["Invalid type filter. Expected one of: upcoming, past."]
    }


@pytest.mark.django_db
def test_should_require_authentication():
    client = APIClient()

    response = client.get("/api/v1/users/me/tickets/")

    assert response.status_code == 401
