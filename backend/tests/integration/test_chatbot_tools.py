from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from catalog.models import (
    CastMember,
    Genre,
    Movie,
    MovieInterest,
    MovieReview,
    MovieStatus,
    Room,
    Session,
)
from chatbot import tools as chatbot_tools
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket
from users.models import WalletTransaction

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


@pytest.mark.django_db
class TestGetMovieDetails:
    def test_returns_full_details_including_average_rating(self):
        movie = _make_movie("Duna Parte Dois", director="Denis Villeneuve")
        genre = Genre.objects.create(name="Ficção Científica")
        movie.genres.add(genre)
        CastMember.objects.create(movie=movie, name="Timothée Chalamet", order=0)
        reviewer = User.objects.create_user(
            email="h@test.com", username="user_h", password="12345678"
        )
        MovieReview.objects.create(movie=movie, user=reviewer, rating="4.5")

        result = chatbot_tools.get_movie_details("Duna")

        assert result["title"] == movie.title
        assert result["director"] == "Denis Villeneuve"
        assert result["genres"] == ["Ficção Científica"]
        assert result["cast"] == ["Timothée Chalamet"]
        assert result["average_rating"] == 4.5

    def test_finds_movies_regardless_of_status(self):
        _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)

        result = chatbot_tools.get_movie_details("Filme Anunciado")

        assert "error" not in result

    def test_returns_movie_not_found_error(self):
        result = chatbot_tools.get_movie_details("Filme Inexistente")

        assert result["error"] == "movie_not_found"


@pytest.mark.django_db
class TestListUpcomingMovies:
    def test_lists_only_em_breve_movies(self):
        upcoming = _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)
        _make_movie("Filme Em Cartaz", status=MovieStatus.EM_CARTAZ)

        result = chatbot_tools.list_upcoming_movies()

        assert len(result) == 1
        assert result[0]["title"] == upcoming.title


@pytest.mark.django_db
class TestListMoviesByGenre:
    def test_lists_bookable_movies_matching_genre(self):
        genre = Genre.objects.create(name="Terror")
        movie = _make_movie("Filme de Terror", status=MovieStatus.EM_CARTAZ)
        movie.genres.add(genre)
        other = _make_movie("Filme de Comédia", status=MovieStatus.EM_CARTAZ)
        other.genres.add(Genre.objects.create(name="Comédia"))

        result = chatbot_tools.list_movies_by_genre("terror")

        titles = {m["title"] for m in result["items"]}
        assert titles == {movie.title}

    def test_excludes_em_breve_movies_even_if_genre_matches(self):
        genre = Genre.objects.create(name="Terror")
        movie = _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)
        movie.genres.add(genre)

        result = chatbot_tools.list_movies_by_genre("terror")

        assert result["items"] == []

    def test_returns_genre_not_found_error(self):
        result = chatbot_tools.list_movies_by_genre("Genero Inexistente")

        assert result["error"] == "genre_not_found"


@pytest.mark.django_db
class TestGetWalletBalance:
    def test_sums_transactions_for_the_requesting_user(self):
        user = User.objects.create_user(
            email="i@test.com", username="user_i", password="12345678"
        )
        WalletTransaction.objects.create(user=user, amount="30.00", reason="refund")
        WalletTransaction.objects.create(user=user, amount="-10.00", reason="purchase")

        result = chatbot_tools.get_wallet_balance(user)

        assert result["balance"] == "20.00"

    def test_returns_zero_balance_with_no_transactions(self):
        user = User.objects.create_user(
            email="j@test.com", username="user_j", password="12345678"
        )

        result = chatbot_tools.get_wallet_balance(user)

        assert result["balance"] == "0.00"


@pytest.mark.django_db
class TestRegisterMovieInterest:
    def test_registers_interest_for_an_em_breve_movie(self):
        user = User.objects.create_user(
            email="k@test.com", username="user_k", password="12345678"
        )
        movie = _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)

        result = chatbot_tools.register_movie_interest(user, "Filme Anunciado")

        assert result["created"] is True
        assert MovieInterest.objects.filter(movie=movie, user=user).exists()

    def test_is_idempotent_on_repeated_calls(self):
        user = User.objects.create_user(
            email="l@test.com", username="user_l", password="12345678"
        )
        _make_movie("Filme Anunciado", status=MovieStatus.EM_BREVE)

        first = chatbot_tools.register_movie_interest(user, "Filme Anunciado")
        second = chatbot_tools.register_movie_interest(user, "Filme Anunciado")

        assert first["created"] is True
        assert second["created"] is False

    def test_rejects_a_movie_that_is_already_bookable(self):
        user = User.objects.create_user(
            email="m@test.com", username="user_m", password="12345678"
        )
        _make_movie("Filme Em Cartaz", status=MovieStatus.EM_CARTAZ)

        result = chatbot_tools.register_movie_interest(user, "Filme Em Cartaz")

        assert result["error"] == "movie_not_coming_soon"

    def test_returns_movie_not_found_error(self):
        user = User.objects.create_user(
            email="n@test.com", username="user_n", password="12345678"
        )

        result = chatbot_tools.register_movie_interest(user, "Filme Inexistente")

        assert result["error"] == "movie_not_found"
