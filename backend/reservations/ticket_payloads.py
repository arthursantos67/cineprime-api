"""Shared builders for the ticket movie/session/room/seat payload shape.

The same nested shape is emitted from four places — checkout responses,
``TicketSerializer``, ``UserTicketSerializer`` and the detach snapshot — so a
new field (e.g. ``ticket_image_url``) has to be added in every one of them or
the payload silently diverges in production. Centralising the shapes here keeps
them in lockstep.

Two families of builders exist:

* ``build_*_payload`` — live objects, localized eagerly (used by checkout and
  the serializers when the ticket still points at a ``SessionSeat``).
* ``build_ticket_snapshot`` / ``*_from_snapshot`` — the raw, untranslated shape
  persisted on ``Ticket.session_snapshot`` before the seat is detached, plus the
  readers that localize it lazily at serialization time.
"""

from cineprime_api.localization import get_translation_value


def build_movie_payload(movie, *, locale):
    return {
        "id": str(movie.id),
        "title": get_translation_value(
            fallback_value=movie.title,
            field="title",
            locale=locale,
            translations=movie.translations,
        ),
        "poster_url": movie.poster_url,
        "ticket_image_url": movie.ticket_image_url,
    }


def build_session_payload(session):
    return {
        "id": str(session.id),
        "start_time": session.start_time,
        "end_time": session.end_time,
        "projection_format": session.projection_format,
        "audio_format": session.audio_format,
    }


def build_room_payload(room, *, locale):
    return {
        "id": str(room.id),
        "name": get_translation_value(
            fallback_value=room.display_name or room.name,
            field="display_name",
            locale=locale,
            translations=room.translations,
        ),
    }


def build_seat_payload(seat):
    return {
        "id": str(seat.id),
        "row": seat.row.name,
        "number": seat.number,
        "identifier": f"{seat.row.name}{seat.number}",
    }


def build_ticket_snapshot(session, seat):
    """Raw, untranslated payload persisted on a ticket before its seat is cut.

    Datetimes are stored as ISO strings and the source ``translations`` are kept
    verbatim so the value survives JSON storage and can still be localized later
    via ``movie_from_snapshot`` / ``room_from_snapshot``.
    """
    movie = session.movie
    room = session.room
    return {
        "movie": {
            "id": str(session.movie_id),
            "title": movie.title,
            "poster_url": movie.poster_url,
            "ticket_image_url": movie.ticket_image_url,
            "translations": movie.translations,
        },
        "session": {
            "id": str(session.id),
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat(),
            "projection_format": session.projection_format,
            "audio_format": session.audio_format,
        },
        "room": {
            "id": str(session.room_id),
            "name": room.display_name or room.name,
            "translations": room.translations,
        },
        "seat": build_seat_payload(seat),
    }


def movie_from_snapshot(snapshot, *, locale):
    movie = (snapshot or {}).get("movie")
    if not movie:
        return None
    return {
        "id": movie["id"],
        "title": get_translation_value(
            fallback_value=movie["title"],
            field="title",
            locale=locale,
            translations=movie.get("translations"),
        ),
        "poster_url": movie["poster_url"],
        "ticket_image_url": movie.get("ticket_image_url"),
    }


def session_from_snapshot(snapshot):
    return (snapshot or {}).get("session")


def room_from_snapshot(snapshot, *, locale):
    room = (snapshot or {}).get("room")
    if not room:
        return None
    return {
        "id": room["id"],
        "name": get_translation_value(
            fallback_value=room["name"],
            field="display_name",
            locale=locale,
            translations=room.get("translations"),
        ),
    }


def seat_from_snapshot(snapshot):
    return (snapshot or {}).get("seat")
