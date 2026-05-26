from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from cineprime_api.logging_context import get_correlation_id
from reservations.locks import SeatLockManager
from reservations.models import SessionSeat, SessionSeatStatus, Ticket


class CheckoutError(Exception):
    pass


class InvalidSeatSelectionError(CheckoutError):
    pass


class ReservationOwnershipError(CheckoutError):
    pass


class ExpiredReservationError(CheckoutError):
    pass


class InvalidSeatStateError(CheckoutError):
    pass


class InvalidSubmittedTotalError(CheckoutError):
    pass


class CheckoutService:
    INVALID_SELECTION_MESSAGE = "One or more selected seats are invalid for checkout."
    OWNERSHIP_MESSAGE = "One or more selected seats are not locked by this user."
    EXPIRED_MESSAGE = "One or more selected seats have expired reservations."
    INVALID_STATE_MESSAGE = "One or more selected seats are not available for checkout."
    INVALID_TOTAL_MESSAGE = "Submitted total does not match the computed total."

    def __init__(self):
        self.lock_manager = SeatLockManager()

    @transaction.atomic
    def execute(self, *, seats, payment_method, user, submitted_total=None):
        ordered_session_seat_ids = sorted(
            {seat["session_seat_id"] for seat in seats},
            key=str,
        )
        ticket_type_by_session_seat_id = {
            seat["session_seat_id"]: seat["ticket_type"] for seat in seats
        }
        now = timezone.now()

        session_seats = list(
            SessionSeat.objects.select_for_update()
            .select_related(
                "seat", "seat__row", "session", "session__movie", "session__room"
            )
            .filter(id__in=ordered_session_seat_ids)
            .order_by("id")
        )

        if len(session_seats) != len(ordered_session_seat_ids):
            raise InvalidSeatSelectionError(self.INVALID_SELECTION_MESSAGE)

        purchased_seats = []
        computed_amount_by_session_seat_id = {}
        computed_total = Decimal("0.00")

        for session_seat in session_seats:
            if session_seat.status != SessionSeatStatus.RESERVED:
                raise InvalidSeatStateError(self.INVALID_STATE_MESSAGE)

            if session_seat.locked_by_user_id != user.id:
                raise ReservationOwnershipError(self.OWNERSHIP_MESSAGE)

            if (
                session_seat.lock_expires_at is None
                or session_seat.lock_expires_at <= now
            ):
                raise ExpiredReservationError(self.EXPIRED_MESSAGE)

            ticket_type = ticket_type_by_session_seat_id[session_seat.id]
            amount_paid = Ticket.calculate_amount(
                session_seat.session.base_price,
                ticket_type,
            )
            computed_amount_by_session_seat_id[session_seat.id] = amount_paid
            computed_total += amount_paid

            session_seat.status = SessionSeatStatus.PURCHASED
            session_seat.locked_by_user = None
            session_seat.lock_expires_at = None
            purchased_seats.append(session_seat)

        if submitted_total is not None and submitted_total != computed_total:
            raise InvalidSubmittedTotalError(self.INVALID_TOTAL_MESSAGE)

        SessionSeat.objects.bulk_update(
            purchased_seats,
            ["status", "locked_by_user", "lock_expires_at"],
        )

        tickets = []
        for session_seat in purchased_seats:
            ticket = Ticket.objects.create(
                user=user,
                session_seat=session_seat,
                ticket_type=ticket_type_by_session_seat_id[session_seat.id],
                amount_paid=computed_amount_by_session_seat_id[session_seat.id],
                payment_method=payment_method,
            )
            tickets.append(ticket)

        ticket_ids = [str(ticket.id) for ticket in tickets]
        correlation_id = get_correlation_id()

        transaction.on_commit(
            lambda: self._release_redis_locks(
                session_seats=purchased_seats,
            )
        )

        transaction.on_commit(
            lambda: self._enqueue_ticket_confirmation_email(
                user_id=str(user.id),
                ticket_ids=ticket_ids,
                correlation_id=correlation_id,
            )
        )

        return {
            "status": "PURCHASED",
            "payment_method": payment_method,
            "total_amount": computed_total,
            "seats": [
                {
                    "session_seat_id": str(session_seat.id),
                    "seat_id": str(session_seat.seat_id),
                    "row": session_seat.seat.row.name,
                    "number": session_seat.seat.number,
                    "status": session_seat.status,
                    "ticket_type": ticket_type_by_session_seat_id[session_seat.id],
                    "amount_paid": computed_amount_by_session_seat_id[session_seat.id],
                }
                for session_seat in purchased_seats
            ],
            "tickets": [
                {
                    "ticket_id": str(ticket.id),
                    "ticket_code": ticket.ticket_code,
                    "session_seat_id": str(ticket.session_seat_id),
                    "seat_id": str(ticket.session_seat.seat_id),
                    "ticket_type": ticket.ticket_type,
                    "amount_paid": ticket.amount_paid,
                    "payment_method": ticket.payment_method,
                    "movie": {
                        "id": str(ticket.session_seat.session.movie_id),
                        "title": ticket.session_seat.session.movie.title,
                    },
                    "session": {
                        "id": str(ticket.session_seat.session_id),
                        "start_time": ticket.session_seat.session.start_time,
                        "end_time": ticket.session_seat.session.end_time,
                    },
                    "room": {
                        "id": str(ticket.session_seat.session.room_id),
                        "name": ticket.session_seat.session.room.name,
                    },
                    "seat": {
                        "id": str(ticket.session_seat.seat_id),
                        "row": ticket.session_seat.seat.row.name,
                        "number": ticket.session_seat.seat.number,
                        "identifier": (
                            f"{ticket.session_seat.seat.row.name}"
                            f"{ticket.session_seat.seat.number}"
                        ),
                    },
                }
                for ticket in tickets
            ],
        }

    def _release_redis_locks(self, *, session_seats):
        for session_seat in session_seats:
            self.lock_manager.release(
                session_id=session_seat.session_id,
                seat_id=session_seat.seat_id,
            )

    @staticmethod
    def _enqueue_ticket_confirmation_email(*, user_id, ticket_ids, correlation_id):
        from reservations.tasks import send_ticket_confirmation_email_task

        apply_async_kwargs = {
            "args": [user_id, ticket_ids],
        }

        if correlation_id:
            apply_async_kwargs["headers"] = {
                "correlation_id": correlation_id,
            }

        send_ticket_confirmation_email_task.apply_async(**apply_async_kwargs)
