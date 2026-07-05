from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Movie, Room, Session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket
from users.models import WalletTransaction

User = get_user_model()

WALLET_URL = "/api/v1/users/me/wallet/"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="wallet@example.com",
        username="walletuser",
        password="StrongPassword123",
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _create_ticket(user, *, seat_number=1):
    room, _ = Room.objects.get_or_create(name="Wallet Room", defaults={"capacity": 100})
    row, _ = SeatRow.objects.get_or_create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=seat_number)

    movie, _ = Movie.objects.get_or_create(
        title="Wallet Movie",
        defaults={
            "synopsis": "...",
            "duration_minutes": 120,
            "release_date": "2026-01-01",
            "poster_url": "http://test.com",
        },
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


@pytest.mark.django_db
class TestWalletEndpoint:
    def test_requires_authentication(self, api_client):
        response = api_client.get(WALLET_URL)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_empty_wallet_returns_zero_balance(self, auth_client):
        response = auth_client.get(WALLET_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["balance"] == "0.00"
        assert response.data["transactions"] == []
        assert response.data["count"] == 0
        assert response.data["has_more"] is False

    def test_balance_is_the_sum_of_transactions(self, auth_client, user):
        WalletTransaction.objects.create(
            user=user,
            amount=Decimal("30.00"),
            reason=WalletTransaction.Reason.REFUND,
            reference="TICKET-1",
        )
        WalletTransaction.objects.create(
            user=user,
            amount=Decimal("-10.50"),
            reason=WalletTransaction.Reason.PURCHASE,
        )

        response = auth_client.get(WALLET_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["balance"] == "19.50"
        assert len(response.data["transactions"]) == 2
        assert response.data["count"] == 2
        assert response.data["has_more"] is False

        first = response.data["transactions"][0]
        assert set(first.keys()) == {"id", "amount", "reason", "reference", "created_at"}

    def test_reports_has_more_when_history_exceeds_page_size(
        self, auth_client, user, monkeypatch
    ):
        from users.views import CurrentUserWalletView

        monkeypatch.setattr(CurrentUserWalletView, "MAX_TRANSACTIONS", 2)

        for index in range(3):
            WalletTransaction.objects.create(
                user=user,
                amount=Decimal("1.00"),
                reason=WalletTransaction.Reason.ADJUSTMENT,
                reference=f"TX-{index}",
            )

        response = auth_client.get(WALLET_URL)

        assert response.status_code == status.HTTP_200_OK
        # Balance covers the full history even though the list is truncated.
        assert response.data["balance"] == "3.00"
        assert len(response.data["transactions"]) == 2
        assert response.data["count"] == 3
        assert response.data["has_more"] is True

    def test_does_not_leak_other_users_transactions(self, auth_client):
        other = User.objects.create_user(
            email="other-wallet@example.com",
            username="otherwallet",
            password="StrongPassword123",
        )
        WalletTransaction.objects.create(
            user=other,
            amount=Decimal("99.00"),
            reason=WalletTransaction.Reason.ADJUSTMENT,
        )

        response = auth_client.get(WALLET_URL)

        assert response.data["balance"] == "0.00"
        assert response.data["transactions"] == []


@pytest.mark.django_db
class TestStaffRefundCreditsWallet:
    def test_staff_ticket_delete_credits_amount_to_owner_wallet(self, api_client, user):
        ticket = _create_ticket(user)
        staff = User.objects.create_user(
            email="staff@example.com",
            username="staffuser",
            password="StrongPassword123",
            is_staff=True,
        )
        api_client.force_authenticate(user=staff)

        response = api_client.delete(f"/api/v1/reservation/tickets/{ticket.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT

        transactions = WalletTransaction.objects.filter(user=user)
        assert transactions.count() == 1

        refund = transactions.first()
        assert refund.amount == Decimal("30.00")
        assert refund.reason == WalletTransaction.Reason.REFUND
        assert refund.reference == ticket.ticket_code

    def test_regular_user_cannot_delete_ticket(self, auth_client, user):
        ticket = _create_ticket(user, seat_number=2)

        response = auth_client.delete(f"/api/v1/reservation/tickets/{ticket.id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert WalletTransaction.objects.filter(user=user).count() == 0
