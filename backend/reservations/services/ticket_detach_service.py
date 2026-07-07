from reservations.models import Ticket


def _build_session_snapshot(session, seat):
    movie = session.movie
    room = session.room
    return {
        "movie": {
            "id": str(session.movie_id),
            "title": movie.title,
            "poster_url": movie.poster_url,
            "translations": movie.translations,
        },
        "session": {
            "id": str(session.id),
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat(),
        },
        "room": {
            "id": str(session.room_id),
            "name": room.display_name or room.name,
            "translations": room.translations,
        },
        "seat": {
            "id": str(seat.id),
            "row": seat.row.name,
            "number": seat.number,
            "identifier": f"{seat.row.name}{seat.number}",
        },
    }


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
        ticket.session_snapshot = _build_session_snapshot(
            session_seat.session, session_seat.seat
        )
        ticket.session_seat = None

    if tickets:
        Ticket.objects.bulk_update(tickets, ["session_seat", "session_snapshot"])

    return tickets
