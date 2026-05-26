from datetime import timedelta

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.locks import SeatLockManager
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus
from users.models import User

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
    "EXCEPTION_HANDLER": "cineprime_natal_api.throttling.throttling_exception_handler",
}


pytestmark = [
    pytest.mark.django_db,
    pytest.mark.usefixtures("disable_throttling_for_module"),
]


@pytest.fixture(autouse=True)
def disable_throttling_for_module():
    from reservations.views import CheckoutView, TemporarySeatReservationView
    from users.views import UserLoginView

    original_login_throttles = UserLoginView.throttle_classes
    original_temp_reservation_throttles = TemporarySeatReservationView.throttle_classes
    original_checkout_throttles = CheckoutView.throttle_classes

    UserLoginView.throttle_classes = []
    TemporarySeatReservationView.throttle_classes = []
    CheckoutView.throttle_classes = []

    with override_settings(REST_FRAMEWORK=REST_FRAMEWORK_OVERRIDE):
        yield

    UserLoginView.throttle_classes = original_login_throttles
    TemporarySeatReservationView.throttle_classes = original_temp_reservation_throttles
    CheckoutView.throttle_classes = original_checkout_throttles


def create_user(email="user@example.com", password="StrongPass123!"):
    return User.objects.create_user(
        username=email,
        email=email,
        password=password,
    )


def create_session_with_seats(movie_title="Interstellar", room_name="Room 1"):
    movie = Movie.objects.create(
        title=movie_title,
        synopsis="A science fiction film.",
        duration_minutes=169,
        release_date="2014-11-07",
        poster_url="https://example.com/interstellar.jpg",
    )

    room = Room.objects.create(
        name=room_name,
        capacity=10,
    )

    row_a = SeatRow.objects.create(room=room, name="A")
    seat_1 = Seat.objects.create(row=row_a, number=1)
    seat_2 = Seat.objects.create(row=row_a, number=2)
    seat_3 = Seat.objects.create(row=row_a, number=3)

    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=timezone.now() + timedelta(hours=2),
        end_time=timezone.now() + timedelta(hours=4),
        base_price="30.00",
    )

    session_seat_1 = SessionSeat.objects.create(session=session, seat=seat_1)
    session_seat_2 = SessionSeat.objects.create(session=session, seat=seat_2)
    session_seat_3 = SessionSeat.objects.create(session=session, seat=seat_3)

    return {
        "session": session,
        "session_seats": [session_seat_1, session_seat_2, session_seat_3],
        "seats": [seat_1, seat_2, seat_3],
    }


def authenticate(client: APIClient, user: User):
    response = client.post(
        reverse("user-login"),
        {
            "email": user.email,
            "password": "StrongPass123!",
        },
        format="json",
    )
    assert response.status_code == 200
    token = response.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


def test_temporary_reservation_success():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]
    seats = data["seats"]

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(seats[0].id), str(seats[1].id)]},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["status"] == "TEMPORARILY_RESERVED"
    assert len(response.data["seats"]) == 2
    assert "expires_at" in response.data

    reserved_seats = SessionSeat.objects.filter(
        session=session,
        seat_id__in=[seats[0].id, seats[1].id],
    ).order_by("seat__number")

    for reserved_seat in reserved_seats:
        assert reserved_seat.status == SessionSeatStatus.RESERVED
        assert reserved_seat.locked_by_user == user
        assert reserved_seat.lock_expires_at is not None


def test_temporary_reservation_requires_authentication():
    client = APIClient()

    data = create_session_with_seats()
    session = data["session"]
    seat = data["seats"][0]

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(seat.id)]},
        format="json",
    )

    assert response.status_code == 401


def test_temporary_reservation_returns_404_for_missing_session():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
    )

    response = client.post(
        url,
        {"seat_ids": ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]},
        format="json",
    )

    assert response.status_code == 404


def test_temporary_reservation_rejects_duplicate_seat_ids():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]
    seat = data["seats"][0]

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(seat.id), str(seat.id)]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "seat_ids" in response.data["error"]["details"]


def test_temporary_reservation_rejects_empty_payload():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": []},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "seat_ids" in response.data["error"]["details"]


def test_temporary_reservation_rejects_seat_not_in_session():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]

    other_room = Room.objects.create(name="Room 2", capacity=5)
    other_row = SeatRow.objects.create(room=other_room, name="B")
    other_seat = Seat.objects.create(row=other_row, number=1)

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(other_seat.id)]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert response.data["error"]["status"] == 400
    assert "seat_ids" in response.data["error"]["details"]


def test_temporary_reservation_returns_conflict_for_reserved_seat():
    client = APIClient()
    user = create_user()
    other_user = create_user(email="other@example.com")
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]
    target_session_seat = data["session_seats"][0]

    target_session_seat.status = SessionSeatStatus.RESERVED
    target_session_seat.locked_by_user = other_user
    target_session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    target_session_seat.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(target_session_seat.seat.id)]},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "SEAT_ALREADY_RESERVED"
    assert response.data["error"]["status"] == 409


def test_temporary_reservation_returns_conflict_for_purchased_seat():
    client = APIClient()
    user = create_user()
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]
    target_session_seat = data["session_seats"][0]

    target_session_seat.status = SessionSeatStatus.PURCHASED
    target_session_seat.locked_by_user = None
    target_session_seat.lock_expires_at = None
    target_session_seat.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {"seat_ids": [str(target_session_seat.seat.id)]},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "SEAT_ALREADY_RESERVED"
    assert response.data["error"]["status"] == 409


def test_temporary_reservation_fails_atomically_for_mixed_availability():
    client = APIClient()
    user = create_user()
    other_user = create_user(email="other@example.com")
    authenticate(client, user)

    data = create_session_with_seats()
    session = data["session"]
    session_seat_1 = data["session_seats"][0]
    session_seat_2 = data["session_seats"][1]

    session_seat_2.status = SessionSeatStatus.RESERVED
    session_seat_2.locked_by_user = other_user
    session_seat_2.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat_2.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.post(
        url,
        {
            "seat_ids": [
                str(session_seat_1.seat.id),
                str(session_seat_2.seat.id),
            ]
        },
        format="json",
    )

    assert response.status_code == 409

    session_seat_1.refresh_from_db()
    assert session_seat_1.status == SessionSeatStatus.AVAILABLE
    assert session_seat_1.locked_by_user is None
    assert session_seat_1.lock_expires_at is None


def test_release_temporary_reservation_success(django_capture_on_commit_callbacks):
    cache.clear()
    client = APIClient()
    user = create_user()
    client.force_authenticate(user=user)

    data = create_session_with_seats()
    session = data["session"]
    session_seat = data["session_seats"][0]
    session_seat.seat.is_accessible = True
    session_seat.seat.save(update_fields=["is_accessible"])
    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = user
    session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat.save()

    lock_key = SeatLockManager.build_key(session.id, session_seat.seat_id)
    cache.set(lock_key, str(user.id), timeout=600)

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        response = client.delete(
            url,
            {"session_seat_ids": [str(session_seat.id)]},
            format="json",
        )

    assert response.status_code == 200
    assert len(callbacks) == 1
    assert cache.get(lock_key) == str(user.id)

    callbacks[0]()

    assert response.data["status"] == "RELEASED"
    assert response.data["session_id"] == str(session.id)
    assert response.data["seats"] == [
        {
            "session_seat_id": str(session_seat.id),
            "seat_id": str(session_seat.seat_id),
            "row": "A",
            "number": 1,
            "status": SessionSeatStatus.AVAILABLE,
            "is_accessible": True,
        }
    ]

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.AVAILABLE
    assert session_seat.locked_by_user is None
    assert session_seat.lock_expires_at is None
    assert cache.get(lock_key) is None


def test_release_temporary_reservation_requires_authentication():
    client = APIClient()
    user = create_user()

    data = create_session_with_seats()
    session = data["session"]
    session_seat = data["session_seats"][0]
    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = user
    session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.delete(
        url,
        {"session_seat_ids": [str(session_seat.id)]},
        format="json",
    )

    assert response.status_code == 401

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED
    assert session_seat.locked_by_user == user
    assert session_seat.lock_expires_at is not None


def test_release_temporary_reservation_rejects_invalid_session_seat_selection():
    client = APIClient()
    user = create_user()
    client.force_authenticate(user=user)

    data = create_session_with_seats()
    session = data["session"]
    other_data = create_session_with_seats(
        movie_title="Interstellar 2",
        room_name="Room 2",
    )
    other_session_seat = other_data["session_seats"][0]

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.delete(
        url,
        {"session_seat_ids": [str(other_session_seat.id)]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_FAILED"
    assert "session_seat_ids" in response.data["error"]["details"]


def test_release_temporary_reservation_returns_404_for_missing_session():
    client = APIClient()
    user = create_user()
    client.force_authenticate(user=user)

    response = client.delete(
        reverse(
            "temporary-seat-reservation",
            kwargs={"session_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
        ),
        {"session_seat_ids": ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]},
        format="json",
    )

    assert response.status_code == 404


def test_release_temporary_reservation_rejects_expired_reservation():
    client = APIClient()
    user = create_user()
    client.force_authenticate(user=user)

    data = create_session_with_seats()
    session = data["session"]
    session_seat = data["session_seats"][0]
    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = user
    session_seat.lock_expires_at = timezone.now() - timedelta(minutes=1)
    session_seat.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.delete(
        url,
        {"session_seat_ids": [str(session_seat.id)]},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "SEAT_ALREADY_RESERVED"

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED
    assert session_seat.locked_by_user == user
    assert session_seat.lock_expires_at is not None


def test_release_temporary_reservation_rejects_ownership_mismatch():
    client = APIClient()
    owner = create_user(email="release-owner@example.com")
    requester = create_user(email="release-requester@example.com")
    client.force_authenticate(user=requester)

    data = create_session_with_seats()
    session = data["session"]
    session_seat = data["session_seats"][0]
    session_seat.status = SessionSeatStatus.RESERVED
    session_seat.locked_by_user = owner
    session_seat.lock_expires_at = timezone.now() + timedelta(minutes=10)
    session_seat.save()

    url = reverse(
        "temporary-seat-reservation",
        kwargs={"session_id": session.id},
    )

    response = client.delete(
        url,
        {"session_seat_ids": [str(session_seat.id)]},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["error"]["code"] == "PERMISSION_DENIED"

    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.RESERVED
    assert session_seat.locked_by_user == owner
    assert session_seat.lock_expires_at is not None
