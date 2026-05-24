import pytest
from decimal import Decimal
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from catalog.models import Genre, Movie, MovieStatus, Room, Session
from reservations.models import SeatRow, Seat, SessionSeat, SessionSeatStatus


@pytest.mark.django_db
class TestCatalogModels:

    def test_create_genre_successfully(self):
        genre = Genre.objects.create(name="Action")

        assert genre.id is not None
        assert genre.name == "Action"

    def test_genre_name_must_be_unique(self):
        Genre.objects.create(name="Action")

        with pytest.raises(IntegrityError):
            Genre.objects.create(name="Action")

    def test_create_movie_with_genres(self):
        genre1 = Genre.objects.create(name="Action")
        genre2 = Genre.objects.create(name="Sci-Fi")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )

        movie.genres.set([genre1, genre2])

        assert movie.id is not None
        assert movie.genres.count() == 2
        assert movie.status == MovieStatus.EM_CARTAZ
        assert movie.is_featured is False

    def test_movie_status_must_use_allowed_choices(self):
        movie = Movie(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
            status="fora_de_catalogo",
        )

        with pytest.raises(ValidationError):
            movie.full_clean()

    def test_movie_unique_title_and_release_date(self):
        Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )

        with pytest.raises(IntegrityError):
            Movie.objects.create(
                title="Interstellar",
                synopsis="Another synopsis",
                duration_minutes=170,
                release_date="2014-11-07",
                poster_url="https://example.com/poster2.jpg",
            )

    def test_create_room_successfully(self):
        room = Room.objects.create(name="Room 1", capacity=100)

        assert room.id is not None
        assert room.capacity == 100

    def test_room_capacity_must_be_positive(self):
        room = Room(
            name="Room 1",
            capacity=0,
        )

        with pytest.raises(ValidationError):
            room.full_clean()

    def test_create_valid_session(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room = Room.objects.create(name="Room 1", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)

        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        assert session.id is not None
        session.refresh_from_db()
        assert session.base_price == Decimal("30.00")

    def test_session_base_price_is_required(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room = Room.objects.create(name="Room 1", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)

        session = Session(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
        )

        with pytest.raises(ValidationError):
            session.full_clean()

    def test_session_base_price_must_be_positive(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room = Room.objects.create(name="Room 1", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)

        session = Session(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="0.00",
        )

        with pytest.raises(ValidationError):
            session.full_clean()

    def test_session_end_time_must_be_after_start_time(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room = Room.objects.create(name="Room 1", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time - timedelta(minutes=10)

        session = Session(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        with pytest.raises(ValidationError):
            session.full_clean()

    def test_session_cannot_overlap_in_same_room(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room = Room.objects.create(name="Room 1", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)

        Session.objects.create(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        overlapping_start = start_time + timedelta(minutes=30)
        overlapping_end = overlapping_start + timedelta(minutes=120)

        session = Session(
            movie=movie,
            room=room,
            start_time=overlapping_start,
            end_time=overlapping_end,
            base_price="30.00",
        )

        with pytest.raises(ValidationError):
            session.full_clean()

    def test_session_cannot_change_sensitive_fields_with_reserved_seats(self, django_user_model):
        genre = Genre.objects.create(name="Action")
        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)
        room = Room.objects.create(name="Room 1", capacity=10)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        seat_row = SeatRow.objects.create(room=room, name="A")
        seat = Seat.objects.create(row=seat_row, number=1)
        user = django_user_model.objects.create_user(
            email="user@example.com", username="user", password="pass"
        )
        session_seat = SessionSeat.objects.create(session=session, seat=seat)
        SessionSeat.objects.filter(pk=session_seat.pk).update(
            status=SessionSeatStatus.RESERVED,
            locked_by_user=user,
            lock_expires_at=timezone.now() + timedelta(minutes=10),
        )

        session.base_price = Decimal("50.00")
        with pytest.raises(ValidationError) as exc_info:
            session.full_clean()

        assert "session" in exc_info.value.message_dict

    def test_session_cannot_change_sensitive_fields_with_purchased_seats(self):
        genre = Genre.objects.create(name="Drama")
        movie = Movie.objects.create(
            title="Arrival",
            synopsis="Linguistics meets aliens",
            duration_minutes=116,
            release_date="2016-11-11",
            poster_url="https://example.com/arrival.jpg",
        )
        movie.genres.add(genre)
        room = Room.objects.create(name="Room 2", capacity=10)

        start_time = timezone.now() + timedelta(days=2)
        end_time = start_time + timedelta(minutes=120)
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="25.00",
        )

        seat_row = SeatRow.objects.create(room=room, name="B")
        seat = Seat.objects.create(row=seat_row, number=1)
        session_seat = SessionSeat.objects.create(session=session, seat=seat)
        SessionSeat.objects.filter(pk=session_seat.pk).update(
            status=SessionSeatStatus.PURCHASED,
        )

        session.base_price = Decimal("40.00")
        with pytest.raises(ValidationError) as exc_info:
            session.full_clean()

        assert "session" in exc_info.value.message_dict

    def test_session_can_change_sensitive_fields_with_only_available_seats(self):
        genre = Genre.objects.create(name="Comedy")
        movie = Movie.objects.create(
            title="The Grand Budapest Hotel",
            synopsis="A quirky tale",
            duration_minutes=99,
            release_date="2014-03-07",
            poster_url="https://example.com/budapest.jpg",
        )
        movie.genres.add(genre)
        room = Room.objects.create(name="Room 3", capacity=10)

        start_time = timezone.now() + timedelta(days=3)
        end_time = start_time + timedelta(minutes=120)
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=start_time,
            end_time=end_time,
            base_price="20.00",
        )

        seat_row = SeatRow.objects.create(room=room, name="A")
        seat = Seat.objects.create(row=seat_row, number=1)
        SessionSeat.objects.create(session=session, seat=seat)

        session.base_price = Decimal("22.00")
        session.full_clean()
        session.save()

        session.refresh_from_db()
        assert session.base_price == Decimal("22.00")

    def test_session_can_overlap_in_different_rooms(self):
        genre = Genre.objects.create(name="Action")

        movie = Movie.objects.create(
            title="Interstellar",
            synopsis="Space exploration",
            duration_minutes=169,
            release_date="2014-11-07",
            poster_url="https://example.com/poster.jpg",
        )
        movie.genres.add(genre)

        room1 = Room.objects.create(name="Room 1", capacity=100)
        room2 = Room.objects.create(name="Room 2", capacity=100)

        start_time = timezone.now() + timedelta(days=1)
        end_time = start_time + timedelta(minutes=120)

        Session.objects.create(
            movie=movie,
            room=room1,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        session = Session.objects.create(
            movie=movie,
            room=room2,
            start_time=start_time,
            end_time=end_time,
            base_price="30.00",
        )

        assert session.id is not None
