import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from users.jwt import issue_tokens_for_user

from catalog.models import Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket
from users.models import AdminPermissionLog, User


# ─── Fixtures ──────────────────────────────────────────────────────────────────

MASTER_PASSWORD = "MasterPass123!"
REGULAR_PASSWORD = "UserPass123!"
STAFF_PASSWORD = "StaffPass123!"


@pytest.fixture
def master_user(db):
    return User.objects.create_superuser(
        email="master@cineprime.local",
        username="master",
        password=MASTER_PASSWORD,
    )


@pytest.fixture
def second_master(db):
    return User.objects.create_superuser(
        email="master2@cineprime.local",
        username="master2",
        password=MASTER_PASSWORD,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        email="staff@cineprime.local",
        username="staff",
        password=STAFF_PASSWORD,
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        email="user@cineprime.local",
        username="regular",
        password=REGULAR_PASSWORD,
    )


@pytest.fixture
def protected_master(db):
    user = User.objects.create_superuser(
        email="santos008@cineprime.local",
        username="santos008",
        password=MASTER_PASSWORD,
    )
    user.is_protected_master = True
    user.save(update_fields=["is_protected_master", "updated_at"])
    return user


def auth_client(user):
    client = APIClient()
    refresh = issue_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def delete_url(user):
    return f"/api/v1/users/{user.id}/"


def create_ticket_for_user(user):
    room = Room.objects.create(name=f"Room-{uuid.uuid4().hex[:6]}", capacity=50)
    row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=1)
    movie = Movie.objects.create(
        title="Test Movie",
        synopsis="...",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="http://example.com/poster.jpg",
    )
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
        status=SessionSeatStatus.PURCHASED,
    )
    return Ticket.objects.create(
        user=user,
        session_seat=session_seat,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )


# ─── Admin deletes other users ────────────────────────────────────────────────


@pytest.mark.django_db
def test_master_can_delete_regular_user(master_user, regular_user):
    client = auth_client(master_user)

    response = client.delete(delete_url(regular_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_master_can_delete_staff_user(master_user, staff_user):
    client = auth_client(master_user)

    response = client.delete(delete_url(staff_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=staff_user.pk).exists()


@pytest.mark.django_db
def test_master_can_delete_other_master(master_user, second_master):
    client = auth_client(master_user)

    response = client.delete(delete_url(second_master), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=second_master.pk).exists()


@pytest.mark.django_db
def test_delete_nonexistent_user_returns_404(master_user):
    client = auth_client(master_user)

    response = client.delete(f"/api/v1/users/{uuid.uuid4()}/", data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_master_cannot_delete_protected_user(master_user, protected_master):
    client = auth_client(master_user)

    response = client.delete(delete_url(protected_master), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=protected_master.pk).exists()


@pytest.mark.django_db
def test_master_cannot_delete_self_via_delete_endpoint(master_user):
    client = auth_client(master_user)

    response = client.delete(delete_url(master_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=master_user.pk).exists()


@pytest.mark.django_db
def test_wrong_password_blocks_deletion(master_user, regular_user):
    client = auth_client(master_user)

    response = client.delete(delete_url(regular_user), data={"password": "WrongPassword!"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_missing_password_blocks_deletion(master_user, regular_user):
    client = auth_client(master_user)

    response = client.delete(delete_url(regular_user), format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_staff_cannot_delete_user(staff_user, regular_user):
    client = auth_client(staff_user)

    response = client.delete(delete_url(regular_user), data={"password": STAFF_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_regular_user_cannot_delete_other_user(regular_user, master_user):
    client = auth_client(regular_user)

    response = client.delete(delete_url(master_user), data={"password": REGULAR_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_unauthenticated_cannot_delete_user(regular_user):
    response = APIClient().delete(delete_url(regular_user))

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── Deletion with tickets ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_delete_user_with_tickets_without_confirm_returns_409(master_user, regular_user):
    create_ticket_for_user(regular_user)
    client = auth_client(master_user)

    response = client.delete(delete_url(regular_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data["error"]["code"] == "HAS_ACTIVE_TICKETS"
    assert response.data["error"]["details"]["ticket_count"] == 1
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_delete_user_with_tickets_with_confirm_succeeds(master_user, regular_user):
    ticket = create_ticket_for_user(regular_user)
    session_seat = ticket.session_seat
    client = auth_client(master_user)

    response = client.delete(
        f"{delete_url(regular_user)}?confirm=true",
        data={"password": MASTER_PASSWORD},
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=regular_user.pk).exists()
    assert not Ticket.objects.filter(pk=ticket.pk).exists()
    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.AVAILABLE
    assert session_seat.locked_by_user is None


@pytest.mark.django_db
def test_delete_user_cascades_permission_logs(master_user, regular_user):
    AdminPermissionLog.objects.create(
        actor=master_user,
        target=regular_user,
        action=AdminPermissionLog.Action.GRANTED,
    )
    client = auth_client(master_user)

    response = client.delete(delete_url(regular_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=regular_user.pk).exists()
    assert not AdminPermissionLog.objects.filter(target_id=regular_user.pk).exists()


@pytest.mark.django_db
def test_delete_user_actor_logs_set_to_null(master_user, regular_user, second_master):
    log = AdminPermissionLog.objects.create(
        actor=regular_user,
        target=master_user,
        action=AdminPermissionLog.Action.GRANTED,
    )
    client = auth_client(second_master)

    response = client.delete(delete_url(regular_user), data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    log.refresh_from_db()
    assert log.actor is None


# ─── Self-delete (DELETE /api/v1/users/me/) ──────────────────────────────────


SELF_DELETE_URL = "/api/v1/users/me/"


@pytest.mark.django_db
def test_regular_user_can_delete_own_account(regular_user):
    client = auth_client(regular_user)

    response = client.delete(SELF_DELETE_URL, data={"password": REGULAR_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_master_can_delete_own_account_when_another_master_exists(master_user, second_master):
    client = auth_client(master_user)

    response = client.delete(SELF_DELETE_URL, data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=master_user.pk).exists()
    assert User.objects.filter(pk=second_master.pk).exists()


@pytest.mark.django_db
def test_master_cannot_delete_own_account_when_only_master(master_user):
    client = auth_client(master_user)

    response = client.delete(SELF_DELETE_URL, data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=master_user.pk).exists()


@pytest.mark.django_db
def test_protected_master_can_delete_own_account_when_another_master_exists(protected_master, second_master):
    client = auth_client(protected_master)

    response = client.delete(
        SELF_DELETE_URL,
        data={"password": MASTER_PASSWORD, "transfer_to": str(second_master.pk)},
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=protected_master.pk).exists()
    second_master.refresh_from_db()
    assert second_master.is_protected_master is True


@pytest.mark.django_db
def test_protected_master_cannot_delete_without_transfer_to(protected_master, second_master):
    client = auth_client(protected_master)

    response = client.delete(SELF_DELETE_URL, data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"]["code"] == "PROTECTED_TRANSFER_REQUIRED"
    assert User.objects.filter(pk=protected_master.pk).exists()


@pytest.mark.django_db
def test_protected_master_transfer_to_non_master_returns_400(protected_master, second_master, regular_user):
    client = auth_client(protected_master)

    response = client.delete(
        SELF_DELETE_URL,
        data={"password": MASTER_PASSWORD, "transfer_to": str(regular_user.pk)},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=protected_master.pk).exists()


@pytest.mark.django_db
def test_protected_master_transfer_to_self_returns_400(protected_master, second_master):
    client = auth_client(protected_master)

    response = client.delete(
        SELF_DELETE_URL,
        data={"password": MASTER_PASSWORD, "transfer_to": str(protected_master.pk)},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=protected_master.pk).exists()


@pytest.mark.django_db
def test_protected_master_cannot_delete_own_account_when_only_master(protected_master):
    client = auth_client(protected_master)

    response = client.delete(SELF_DELETE_URL, data={"password": MASTER_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=protected_master.pk).exists()


@pytest.mark.django_db
def test_is_protected_master_db_field_transferred(protected_master, second_master):
    client = auth_client(protected_master)

    assert not second_master.is_protected_master

    response = client.delete(
        SELF_DELETE_URL,
        data={"password": MASTER_PASSWORD, "transfer_to": str(second_master.pk)},
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    second_master.refresh_from_db()
    assert second_master.is_protected_master is True
    assert second_master.is_protected is True


@pytest.mark.django_db
def test_self_delete_wrong_password_returns_400(regular_user):
    client = auth_client(regular_user)

    response = client.delete(SELF_DELETE_URL, data={"password": "wrong"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_self_delete_with_tickets_without_confirm_returns_409(regular_user):
    create_ticket_for_user(regular_user)
    client = auth_client(regular_user)

    response = client.delete(SELF_DELETE_URL, data={"password": REGULAR_PASSWORD}, format="json")

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data["error"]["code"] == "HAS_ACTIVE_TICKETS"
    assert response.data["error"]["details"]["ticket_count"] == 1
    assert User.objects.filter(pk=regular_user.pk).exists()


@pytest.mark.django_db
def test_self_delete_with_tickets_with_confirm_succeeds(regular_user):
    ticket = create_ticket_for_user(regular_user)
    session_seat = ticket.session_seat
    client = auth_client(regular_user)

    response = client.delete(
        f"{SELF_DELETE_URL}?confirm=true",
        data={"password": REGULAR_PASSWORD},
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=regular_user.pk).exists()
    assert not Ticket.objects.filter(pk=ticket.pk).exists()
    session_seat.refresh_from_db()
    assert session_seat.status == SessionSeatStatus.AVAILABLE


@pytest.mark.django_db
def test_unauthenticated_cannot_self_delete():
    response = APIClient().delete(SELF_DELETE_URL)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
