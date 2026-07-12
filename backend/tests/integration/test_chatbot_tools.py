from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from catalog.models import Movie, MovieStatus, Room, Session
from chatbot import tools as chatbot_tools
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket

User = get_user_model()


def _make_movie(title, status=MovieStatus.EM_CARTAZ, **kwargs):
    return Movie.objects.create(
        title=title,
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="https://example.com/poster.jpg",
        status=status,
        **kwargs,
    )


def _make_room(name="Room 1"):
    return Room.objects.create(name=name, capacity=10)


def _make_session(movie, room, start_time=None):
    start_time = start_time or timezone.now() + timedelta(days=1)
    return Session.objects.create(
        movie=movie,
        room=room,
        start_time=start_time,
        end_time=start_time + timedelta(hours=2),
        base_price="30.00",
    )


def _make_seat(room, row_name="A", number=1):
    row, _ = SeatRow.objects.get_or_create(room=room, name=row_name)
    return Seat.objects.create(row=row, number=number)


@pytest.mark.django_db
class TestListNowShowingMovies:
    def test_includes_em_cartaz_and_pre_venda(self):
        em_cartaz = _make_movie("Filme Em Cartaz", status=MovieStatus.EM_CARTAZ)
        pre_venda = _make_movie("Filme Pre Venda", status=MovieStatus.PRE_VENDA)

        result = chatbot_tools.list_now_showing_movies()

        titles = {movie["title"] for movie in result}
        assert em_cartaz.title in titles
        assert pre_venda.title in titles

    def test_excludes_em_breve(self):
        _make_movie("Filme Em Breve", status=MovieStatus.EM_BREVE)

        result = chatbot_tools.list_now_showing_movies()

        assert result == []


@pytest.mark.django_db
class TestListSessionsForMovie:
    def test_returns_needs_slot_when_date_missing(self):
        movie = _make_movie("Duna Parte Dois")

        result = chatbot_tools.list_sessions_for_movie("Duna")

        assert result["needs_slot"] == "date"
        assert result["movie_title"] == movie.title

    def test_returns_sessions_for_given_date(self):
        movie = _make_movie("Duna Parte Dois")
        room = _make_room()
        start_time = timezone.now().replace(
            hour=18, minute=0, second=0, microsecond=0
        ) + timedelta(days=1)
        session = _make_session(movie, room, start_time=start_time)

        result = chatbot_tools.list_sessions_for_movie(
            "Duna", date=start_time.date().isoformat()
        )

        assert result["movie_title"] == movie.title
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["id"] == str(session.id)

    def test_returns_empty_sessions_for_date_without_matches(self):
        movie = _make_movie("Duna Parte Dois")
        room = _make_room()
        _make_session(movie, room, start_time=timezone.now() + timedelta(days=1))

        far_future_date = (timezone.now() + timedelta(days=30)).date().isoformat()
        result = chatbot_tools.list_sessions_for_movie("Duna", date=far_future_date)

        assert result["sessions"] == []

    def test_returns_movie_not_found_error(self):
        result = chatbot_tools.list_sessions_for_movie(
            "Filme Inexistente", date="2026-01-01"
        )

        assert result["error"] == "movie_not_found"

    def test_ignores_em_breve_movie_when_matching_title(self):
        _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)

        result = chatbot_tools.list_sessions_for_movie(
            "Filme Anunciado", date="2026-01-01"
        )

        assert result["error"] == "movie_not_found"

    def test_returns_invalid_date_error(self):
        _make_movie("Duna Parte Dois")

        result = chatbot_tools.list_sessions_for_movie("Duna", date="not-a-date")

        assert result["error"] == "invalid_date"


@pytest.mark.django_db
class TestCheckSessionAvailability:
    def test_returns_available_seats_count(self):
        movie = _make_movie("Movie 1")
        room = _make_room()
        session = _make_session(movie, room)
        seat_1 = _make_seat(room, "A", 1)
        seat_2 = _make_seat(room, "A", 2)
        SessionSeat.objects.create(
            session=session, seat=seat_1, status=SessionSeatStatus.AVAILABLE
        )
        SessionSeat.objects.create(
            session=session, seat=seat_2, status=SessionSeatStatus.PURCHASED
        )

        result = chatbot_tools.check_session_availability(str(session.id))

        assert result["bookable"] is True
        assert result["available"] is True
        assert result["available_seats"] == 1

    def test_returns_no_availability_when_fully_purchased(self):
        movie = _make_movie("Movie 1")
        room = _make_room()
        session = _make_session(movie, room)
        seat_1 = _make_seat(room, "A", 1)
        SessionSeat.objects.create(
            session=session, seat=seat_1, status=SessionSeatStatus.PURCHASED
        )

        result = chatbot_tools.check_session_availability(str(session.id))

        assert result["available"] is False
        assert result["available_seats"] == 0

    def test_returns_session_not_found_for_unknown_id(self):
        result = chatbot_tools.check_session_availability(
            "00000000-0000-0000-0000-000000000000"
        )

        assert result["error"] == "session_not_found"

    def test_returns_session_not_found_for_malformed_id(self):
        result = chatbot_tools.check_session_availability("not-a-uuid")

        assert result["error"] == "session_not_found"

    def test_em_breve_movie_session_is_not_bookable(self):
        movie = _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)
        room = _make_room()
        session = _make_session(movie, room)
        seat_1 = _make_seat(room, "A", 1)
        SessionSeat.objects.create(
            session=session, seat=seat_1, status=SessionSeatStatus.AVAILABLE
        )

        result = chatbot_tools.check_session_availability(str(session.id))

        assert result["bookable"] is False
        assert result["available"] is False


@pytest.mark.django_db
class TestListMyTickets:
    def _ticket_for(self, user, movie_title="Movie 1"):
        movie = _make_movie(movie_title)
        room = _make_room(name=f"Room {movie_title}")
        session = _make_session(movie, room)
        seat = _make_seat(room, "A", 1)
        session_seat = SessionSeat.objects.create(
            session=session, seat=seat, status=SessionSeatStatus.PURCHASED
        )
        return Ticket.objects.create(
            user=user,
            session_seat=session_seat,
            ticket_type="inteira",
            amount_paid="30.00",
            payment_method="pix",
        )

    def test_scoped_to_requesting_user(self):
        user_a = User.objects.create_user(
            email="a@test.com", username="user_a", password="12345678"
        )
        user_b = User.objects.create_user(
            email="b@test.com", username="user_b", password="12345678"
        )
        self._ticket_for(user_a, "Filme do usuario A")
        self._ticket_for(user_b, "Filme do usuario B")

        result = chatbot_tools.list_my_tickets(user_a)

        assert len(result) == 1
        assert result[0]["movie"]["title"] == "Filme do usuario A"

    def test_returns_empty_list_when_no_tickets(self):
        user = User.objects.create_user(
            email="c@test.com", username="user_c", password="12345678"
        )

        result = chatbot_tools.list_my_tickets(user)

        assert result == []


@pytest.mark.django_db
class TestNextSessionForUser:
    def _ticket_at(self, user, start_time, movie_title):
        movie = _make_movie(movie_title)
        room = _make_room(name=f"Room {movie_title}")
        session = _make_session(movie, room, start_time=start_time)
        seat = _make_seat(room, "A", 1)
        session_seat = SessionSeat.objects.create(
            session=session, seat=seat, status=SessionSeatStatus.PURCHASED
        )
        return Ticket.objects.create(
            user=user,
            session_seat=session_seat,
            ticket_type="inteira",
            amount_paid="30.00",
            payment_method="pix",
        )

    def test_returns_soonest_upcoming_ticket(self):
        user = User.objects.create_user(
            email="d@test.com", username="user_d", password="12345678"
        )
        now = timezone.now()
        self._ticket_at(user, now + timedelta(days=10), "Filme Distante")
        self._ticket_at(user, now + timedelta(days=1), "Filme Proximo")

        result = chatbot_tools.next_session_for_user(user)

        assert result["movie"]["title"] == "Filme Proximo"

    def test_returns_none_when_no_upcoming_tickets(self):
        user = User.objects.create_user(
            email="e@test.com", username="user_e", password="12345678"
        )
        now = timezone.now()
        self._ticket_at(user, now - timedelta(days=1), "Filme Passado")

        result = chatbot_tools.next_session_for_user(user)

        assert result is None

    def test_scoped_to_requesting_user(self):
        user_a = User.objects.create_user(
            email="f@test.com", username="user_f", password="12345678"
        )
        user_b = User.objects.create_user(
            email="g@test.com", username="user_g", password="12345678"
        )
        self._ticket_at(
            user_b, timezone.now() + timedelta(days=1), "Filme do usuario B"
        )

        result = chatbot_tools.next_session_for_user(user_a)

        assert result is None
