from reservations.models import Ticket
from reservations.ticket_payloads import build_ticket_snapshot


def detach_tickets(tickets_queryset):
    """Snapshot display data onto tickets and clear their session_seat link.

    Call this before deleting anything Ticket.session_seat's on_delete=SET_NULL
    can cascade from (a Session, SessionSeat, Seat or SeatRow) — otherwise the
    ticket silently loses its movie/session/room/seat display data forever.
    Uses bulk_update (skipping Ticket.full_clean/save) since every field
    written here is already computed from trusted, validated source data.
    """
    tickets = list(
        tickets_queryset.select_related(
            "session_seat__session__movie",
            "session_seat__session__room",
            "session_seat__seat__row",
        )
    )
    for ticket in tickets:
        session_seat = ticket.session_seat
        ticket.session_snapshot = build_ticket_snapshot(
            session_seat.session, session_seat.seat
        )
        ticket.session_seat = None

    if tickets:
        Ticket.objects.bulk_update(tickets, ["session_seat", "session_snapshot"])

    return tickets
