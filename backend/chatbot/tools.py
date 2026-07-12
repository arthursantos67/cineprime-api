"""Plain, LLM-independent implementations behind each chatbot tool.

Kept separate from the ``@tool``-decorated wrappers in ``chatbot.agent`` so each
capability can be unit tested directly, without going through LangChain or a real
LLM call.
"""

import uuid

from django.utils.dateparse import parse_date

from catalog.models import Movie, MovieStatus, Session
from reservations.models import SessionSeat, SessionSeatStatus
from users.serializers import UserTicketSerializer
from users.services.ticket_query_service import build_my_tickets_queryset

BOOKABLE_MOVIE_STATUSES = [MovieStatus.EM_CARTAZ, MovieStatus.PRE_VENDA]


def list_now_showing_movies():
    movies = Movie.objects.filter(status__in=BOOKABLE_MOVIE_STATUSES).order_by("title")
    return [
        {"id": str(movie.id), "title": movie.title, "status": movie.status}
        for movie in movies
    ]


def list_sessions_for_movie(movie_title, date=None):
    movie = (
        Movie.objects.filter(
            title__icontains=movie_title, status__in=BOOKABLE_MOVIE_STATUSES
        )
        .order_by("title")
        .first()
    )
    if movie is None:
        return {"error": "movie_not_found", "movie_title": movie_title}

    if not date:
        return {
            "needs_slot": "date",
            "movie_id": str(movie.id),
            "movie_title": movie.title,
        }

    parsed_date = date if not isinstance(date, str) else parse_date(date)
    if parsed_date is None:
        return {
            "error": "invalid_date",
            "movie_id": str(movie.id),
            "movie_title": movie.title,
            "date": date,
        }

    sessions = (
        Session.objects.filter(movie=movie, start_time__date=parsed_date)
        .select_related("room")
        .order_by("start_time")
    )
    return {
        "movie_id": str(movie.id),
        "movie_title": movie.title,
        "date": str(parsed_date),
        "sessions": [
            {
                "id": str(session.id),
                "start_time": session.start_time.isoformat(),
                "room": session.room.display_name or session.room.name,
            }
            for session in sessions
        ],
    }


def check_session_availability(session_id):
    try:
        session_uuid = uuid.UUID(str(session_id))
    except (ValueError, AttributeError, TypeError):
        return {"error": "session_not_found", "session_id": session_id}

    session = Session.objects.select_related("movie").filter(id=session_uuid).first()
    if session is None:
        return {"error": "session_not_found", "session_id": session_id}

    if session.movie.status == MovieStatus.EM_BREVE:
        return {
            "session_id": str(session.id),
            "bookable": False,
            "available": False,
            "available_seats": 0,
        }

    available_seats = SessionSeat.objects.filter(
        session=session,
        status=SessionSeatStatus.AVAILABLE,
    ).count()

    return {
        "session_id": str(session.id),
        "bookable": True,
        "available": available_seats > 0,
        "available_seats": available_seats,
    }


def list_my_tickets(user, ticket_type=None):
    queryset = build_my_tickets_queryset(user, ticket_type)
    return UserTicketSerializer(queryset, many=True).data


def next_session_for_user(user):
    queryset = build_my_tickets_queryset(user, "upcoming").order_by(
        "session_seat__session__start_time"
    )
    ticket = queryset.first()
    if ticket is None:
        return None
    return UserTicketSerializer(ticket).data
