from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import SessionSeat, SessionSeatStatus, Seat, SeatRow, Ticket


def _create_user(email="checkout@example.com", username="checkout_user"):
    user_model = get_user_model()
    return user_model.objects.create_user(
        email=email,
        username=username,
        password="StrongPass123!",
    )


def _build_checkout_context(
    *,
    user=None,
    seat_numbers=(1,),
    statuses=None,
    base_price="30.00",
):
    user = user or _create_user()
    room = Room.objects.create(
        name=f"Checkout Room {Room.objects.count() + 1}", capacity=100
    )
    row = SeatRow.objects.create(room=room, name="A")

    movie = Movie.objects.create(
        title=f"Checkout Movie {Movie.objects.count() + 1}",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() + timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=3),
        base_price=base_price,
    )

    statuses = statuses or [SessionSeatStatus.RESERVED] * len(seat_numbers)
    seats = []
    session_seats = []

    for seat_number, seat_status in zip(seat_numbers, statuses, strict=True):
        seat = Seat.objects.create(row=row, number=seat_number)
        seats.append(seat)
        is_reserved = seat_status == SessionSeatStatus.RESERVED
        session_seats.append(
            SessionSeat.objects.create(
                session=session,
                seat=seat,
                status=seat_status,
                locked_by_user=user if is_reserved else None,
                lock_expires_at=(
                    timezone.now() + timedelta(minutes=10) if is_reserved else None
                ),
            )
        )

    return {
        "user": user,
        "session": session,
        "seats": seats,
        "session_seats": session_seats,
    }


def _checkout_payload(session_seats, ticket_types, payment_method="pix", **extra):
    payload = {
        "seats": [
            {
                "session_seat_id": str(session_seat.id),
                "ticket_type": ticket_type,
            }
            for session_seat, ticket_type in zip(
                session_seats, ticket_types, strict=True
            )
        ],
        "payment_method": payment_method,
    }
    payload.update(extra)
    return payload


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("ticket_type", "expected_amount"),
    [
        ("inteira", "30.00"),
        ("meia", "15.00"),
    ],
)
def test_checkout_should_purchase_single_reserved_seat_with_ticket_type(
    ticket_type,
    expected_amount,
):
    context = _build_checkout_context()

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], [ticket_type], "pix"),
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "PURCHASED"
    assert response.data["payment_method"] == "pix"
    assert response.data["total_amount"] == expected_amount
    assert response.data["seats"][0]["session_seat_id"] == str(
        context["session_seats"][0].id
    )
    assert response.data["seats"][0]["ticket_type"] == ticket_type
    assert response.data["seats"][0]["amount_paid"] == expected_amount
    assert response.data["tickets"][0]["ticket_type"] == ticket_type
    assert response.data["tickets"][0]["amount_paid"] == expected_amount
    assert response.data["tickets"][0]["payment_method"] == "pix"
    assert response.data["tickets"][0]["movie"] == {
        "id": str(context["session"].movie_id),
        "title": context["session"].movie.title,
        "poster_url": context["session"].movie.poster_url,
        "ticket_image_url": context["session"].movie.ticket_image_url,
    }
    assert response.data["tickets"][0]["session"]["id"] == str(context["session"].id)
    assert response.data["tickets"][0]["session"]["start_time"] is not None
    assert response.data["tickets"][0]["session"]["end_time"] is not None
    assert (
        response.data["tickets"][0]["session"]["projection_format"]
        == context["session"].projection_format
    )
    assert (
        response.data["tickets"][0]["session"]["audio_format"]
        == context["session"].audio_format
    )
    assert response.data["tickets"][0]["room"] == {
        "id": str(context["session"].room_id),
        "name": context["session"].room.name,
    }
    assert response.data["tickets"][0]["seat"] == {
        "id": str(context["seats"][0].id),
        "row": context["seats"][0].row.name,
        "number": context["seats"][0].number,
        "identifier": "A1",
    }

    session_seat = context["session_seats"][0]
    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.PURCHASED
    assert session_seat.locked_by_user is None
    assert session_seat.lock_expires_at is None

    ticket = Ticket.objects.get(session_seat=session_seat)
    assert ticket.ticket_type == ticket_type
    assert ticket.amount_paid == Decimal(expected_amount)
    assert ticket.payment_method == "pix"


@pytest.mark.django_db
def test_checkout_should_compute_mixed_ticket_type_total():
    context = _build_checkout_context(seat_numbers=(1, 2), base_price="42.50")

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(
            context["session_seats"],
            ["inteira", "meia"],
            "cartao_credito",
            total_amount="63.75",
        ),
        format="json",
    )

    assert response.status_code == 200
    assert response.data["payment_method"] == "cartao_credito"
    assert response.data["total_amount"] == "63.75"

    amounts_by_type = {
        seat["ticket_type"]: seat["amount_paid"] for seat in response.data["seats"]
    }
    assert amounts_by_type == {"inteira": "42.50", "meia": "21.25"}

    tickets = Ticket.objects.filter(user=context["user"]).order_by("amount_paid")
    assert [ticket.amount_paid for ticket in tickets] == [
        Decimal("21.25"),
        Decimal("42.50"),
    ]


@pytest.mark.django_db
def test_checkout_should_reject_invalid_ticket_type():
    context = _build_checkout_context()

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["promocional"], "pix"),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_TICKET_TYPE"
    assert response.data["error"]["status"] == 400


@pytest.mark.django_db
def test_checkout_should_reject_invalid_payment_method():
    context = _build_checkout_context()

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "boleto"),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_PAYMENT_METHOD"
    assert response.data["error"]["status"] == 400


@pytest.mark.django_db
def test_checkout_should_reject_mismatched_submitted_total():
    context = _build_checkout_context(base_price="30.00")

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(
            context["session_seats"],
            ["meia"],
            "pix",
            total_amount="30.00",
        ),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert "total_amount" in response.data["error"]["details"]
    assert Ticket.objects.filter(user=context["user"]).count() == 0

    session_seat = context["session_seats"][0]
    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED


@pytest.mark.django_db
def test_checkout_should_fail_for_expired_reservation():
    context = _build_checkout_context()
    session_seat = context["session_seats"][0]
    session_seat.lock_expires_at = timezone.now() - timedelta(minutes=1)
    session_seat.save()

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "pix"),
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "SEAT_ALREADY_RESERVED"
    assert response.data["error"]["status"] == 409

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED
    assert session_seat.locked_by_user == context["user"]
    assert session_seat.lock_expires_at is not None


@pytest.mark.django_db
def test_checkout_should_fail_for_different_user():
    owner = _create_user(email="owner@example.com", username="owner_user")
    another_user = _create_user(email="other@example.com", username="other_user")
    context = _build_checkout_context(user=owner)

    client = APIClient()
    client.force_authenticate(user=another_user)

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "pix"),
        format="json",
    )

    assert response.status_code == 403
    assert response.data["error"]["code"] == "PERMISSION_DENIED"
    assert response.data["error"]["status"] == 403

    session_seat = context["session_seats"][0]
    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED


@pytest.mark.django_db
def test_checkout_should_be_atomic_when_one_seat_is_invalid():
    context = _build_checkout_context(
        seat_numbers=(1, 2),
        statuses=[SessionSeatStatus.RESERVED, SessionSeatStatus.AVAILABLE],
    )

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira", "meia"], "pix"),
        format="json",
    )

    assert response.status_code == 409
    assert Ticket.objects.filter(user=context["user"]).count() == 0

    session_seat_valid, session_seat_invalid = context["session_seats"]
    session_seat_valid.refresh_from_db()
    session_seat_invalid.refresh_from_db()

    assert session_seat_valid.status == SessionSeatStatus.RESERVED
    assert session_seat_invalid.status == SessionSeatStatus.AVAILABLE


@pytest.mark.django_db
def test_list_movies_should_use_cache_on_second_request():
    cache.clear()

    Movie.objects.create(
        title="Cached Checkout Movie",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )

    api_client = APIClient()

    with CaptureQueriesContext(connection) as first_request_queries:
        first_response = api_client.get("/api/v1/catalog/movies/")

    with CaptureQueriesContext(connection) as second_request_queries:
        second_response = api_client.get("/api/v1/catalog/movies/")

    assert first_response.status_code == status.HTTP_200_OK
    assert second_response.status_code == status.HTTP_200_OK
    assert first_response.data == second_response.data
    assert len(second_request_queries) < len(first_request_queries)
    cache.clear()


@pytest.mark.django_db
def test_checkout_returns_410_when_session_starts_in_less_than_15_min():
    context = _build_checkout_context()
    session = context["session"]

    # Session starts in 14 minutes — past the 15-minute presale cutoff
    Session.objects.filter(pk=session.pk).update(
        start_time=timezone.now() + timedelta(minutes=14),
        end_time=timezone.now() + timedelta(hours=2),
    )

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "pix"),
        format="json",
    )

    assert response.status_code == 410
    assert response.data["error"]["code"] == "SESSION_EXPIRED"
    assert Ticket.objects.filter(user=context["user"]).count() == 0


@pytest.mark.django_db
def test_checkout_returns_410_at_exact_15_min_presale_boundary():
    context = _build_checkout_context()
    session = context["session"]

    # Session starts in exactly 15 minutes — at the cutoff boundary (now >= cutoff)
    Session.objects.filter(pk=session.pk).update(
        start_time=timezone.now() + timedelta(minutes=15),
        end_time=timezone.now() + timedelta(hours=2),
    )

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "pix"),
        format="json",
    )

    assert response.status_code == 410
    assert response.data["error"]["code"] == "SESSION_EXPIRED"
    assert Ticket.objects.filter(user=context["user"]).count() == 0


@pytest.mark.django_db
def test_checkout_is_allowed_when_session_starts_more_than_15_min_away():
    context = _build_checkout_context()
    session = context["session"]

    # Session starts in 16 minutes — before the presale cutoff
    Session.objects.filter(pk=session.pk).update(
        start_time=timezone.now() + timedelta(minutes=16),
        end_time=timezone.now() + timedelta(hours=2),
    )

    client = APIClient()
    client.force_authenticate(user=context["user"])

    response = client.post(
        "/api/v1/reservation/checkout/",
        _checkout_payload(context["session_seats"], ["inteira"], "pix"),
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "PURCHASED"
