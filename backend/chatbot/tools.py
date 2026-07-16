"""Plain, LLM-independent implementations behind each chatbot tool.

Kept separate from the ``@tool``-decorated wrappers in ``chatbot.agent`` so each
capability can be unit tested directly, without going through LangChain or a real
LLM call.
"""

import uuid
from decimal import Decimal

from django.db.models import Avg, Q, Sum
from django.utils.dateparse import parse_date

from catalog.models import Genre, Movie, MovieInterest, MovieStatus, Session
from reservations.models import SessionSeat, SessionSeatStatus
from users.models import WalletTransaction
from users.serializers import UserTicketSerializer
from users.services.ticket_query_service import build_my_tickets_queryset

BOOKABLE_MOVIE_STATUSES = [MovieStatus.EM_CARTAZ, MovieStatus.PRE_VENDA]

# A movie's own rating is masked out while it's back in "em_breve" (see
# catalog.views._movie_queryset_with_aggregates): reviews left while it was
# showing shouldn't be surfaced as if it were still available.
_NOT_COMING_SOON = ~Q(status=MovieStatus.EM_BREVE)


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
                "price": str(session.base_price),
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
        "price": str(session.base_price),
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


def get_movie_details(movie_title):
    """Synopsis, cast, classification, and rating for one movie, searched by title.

    Unlike ``list_now_showing_movies``/``list_sessions_for_movie``, this looks up a
    movie across every status (including "em_breve"), since "what's it about"/"who's
    in it" are as sensible for an announced movie as for one currently showing.
    """
    movie = (
        Movie.objects.filter(title__icontains=movie_title)
        .prefetch_related("genres", "cast")
        .annotate(average_rating=Avg("reviews__rating", filter=_NOT_COMING_SOON))
        .order_by("title")
        .first()
    )
    if movie is None:
        return {"error": "movie_not_found", "movie_title": movie_title}

    return {
        "id": str(movie.id),
        "title": movie.title,
        "status": movie.status,
        "synopsis": movie.synopsis,
        "duration_minutes": movie.duration_minutes,
        "age_rating": movie.age_rating,
        "director": movie.director,
        "genres": [genre.name for genre in movie.genres.all()],
        "cast": [member.name for member in movie.cast.all()],
        "average_rating": (
            round(float(movie.average_rating), 1)
            if movie.average_rating is not None
            else None
        ),
    }


def list_upcoming_movies():
    movies = Movie.objects.filter(status=MovieStatus.EM_BREVE).order_by(
        "release_date", "title"
    )
    return [
        {"id": str(movie.id), "title": movie.title, "release_date": str(movie.release_date)}
        for movie in movies
    ]


def list_movies_by_genre(genre_name):
    if not Genre.objects.filter(name__icontains=genre_name).exists():
        return {"error": "genre_not_found", "genre_name": genre_name}

    movies = (
        Movie.objects.filter(
            genres__name__icontains=genre_name, status__in=BOOKABLE_MOVIE_STATUSES
        )
        .distinct()
        .order_by("title")
    )
    return {
        "genre_name": genre_name,
        "items": [
            {"id": str(movie.id), "title": movie.title, "status": movie.status}
            for movie in movies
        ],
    }


def get_wallet_balance(user):
    total = WalletTransaction.objects.filter(user=user).aggregate(total=Sum("amount"))[
        "total"
    ]
    return {"balance": str(total if total is not None else Decimal("0.00"))}


def register_movie_interest(user, movie_title):
    """Register the user to be notified when an announced ("em_breve") movie opens.

    Mirrors the same EM_BREVE-only rule as ``MovieInterestView.post`` (see
    catalog/views.py) — interest only makes sense for a movie that isn't bookable yet.
    """
    movie = Movie.objects.filter(title__icontains=movie_title).order_by("title").first()
    if movie is None:
        return {"error": "movie_not_found", "movie_title": movie_title}

    if movie.status != MovieStatus.EM_BREVE:
        return {"error": "movie_not_coming_soon", "movie_title": movie.title}

    _, created = MovieInterest.objects.get_or_create(movie=movie, user=user)
    return {"movie_title": movie.title, "created": created}
