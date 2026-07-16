from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from catalog.models import Movie, Room, Session
from catalog.tasks import delete_ended_session
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus, Ticket


@pytest.fixture
def room(db):
    return Room.objects.create(name="Room Auto Deletion", capacity=100)


@pytest.fixture
def movie(db):
    return Movie.objects.create(
        title="Auto Deletion Movie",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-03-21",
        poster_url="https://example.com/poster.jpg",
    )


@pytest.mark.django_db
def test_creating_session_schedules_deletion_task_at_end_time(
    room, movie, django_capture_on_commit_callbacks
):
    end_time = timezone.now() + timedelta(hours=3)

    with patch("catalog.tasks.delete_ended_session.apply_async") as mocked_apply_async:
        with django_capture_on_commit_callbacks(execute=True):
            session = Session.objects.create(
                movie=movie,
                room=room,
                start_time=timezone.now() + timedelta(hours=1),
                end_time=end_time,
                base_price="30.00",
            )

    mocked_apply_async.assert_called_once()
    call_kwargs = mocked_apply_async.call_args.kwargs
    assert call_kwargs["args"] == [str(session.id)]
    assert call_kwargs["eta"] == end_time


@pytest.mark.django_db
def test_updating_session_end_time_reschedules_deletion_task(
    room, movie, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() + timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=3),
            base_price="30.00",
        )

    new_end_time = timezone.now() + timedelta(hours=5)

    with patch("catalog.tasks.delete_ended_session.apply_async") as mocked_apply_async:
        with django_capture_on_commit_callbacks(execute=True):
            session.end_time = new_end_time
            session.save()

    mocked_apply_async.assert_called_once()
    call_kwargs = mocked_apply_async.call_args.kwargs
    assert call_kwargs["args"] == [str(session.id)]
    assert call_kwargs["eta"] == new_end_time


@pytest.mark.django_db
def test_delete_ended_session_task_deletes_session_and_detaches_tickets(room, movie):
    with patch("catalog.tasks.delete_ended_session.apply_async"):
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() - timedelta(hours=3),
            end_time=timezone.now() - timedelta(hours=1),
            base_price="30.00",
        )

    seat_row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=seat_row, number=1)
    session_seat = SessionSeat.objects.create(
        session=session,
        seat=seat,
        status=SessionSeatStatus.PURCHASED,
    )
    user = get_user_model().objects.create_user(
        email="auto-delete-ticket@example.com",
        username="autodeleteticket",
        password="StrongPass123!",
    )
    ticket = Ticket.objects.create(
        user=user,
        session_seat=session_seat,
        ticket_type="inteira",
        amount_paid="30.00",
        payment_method="pix",
    )

    delete_ended_session(str(session.id))

    assert not Session.objects.filter(id=session.id).exists()
    ticket.refresh_from_db()
    assert ticket.session_seat_id is None
    assert ticket.session_snapshot["session"]["id"] == str(session.id)


@pytest.mark.django_db
def test_delete_ended_session_task_reschedules_when_session_still_running(
    room, movie, django_capture_on_commit_callbacks
):
    end_time = timezone.now() + timedelta(hours=3)

    with patch("catalog.tasks.delete_ended_session.apply_async"):
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() + timedelta(hours=1),
            end_time=end_time,
            base_price="30.00",
        )

    with patch("catalog.tasks.delete_ended_session.apply_async") as mocked_apply_async:
        with django_capture_on_commit_callbacks(execute=True):
            delete_ended_session(str(session.id))

    assert Session.objects.filter(id=session.id).exists()
    mocked_apply_async.assert_called_once_with(args=[str(session.id)], eta=end_time)


@pytest.mark.django_db
def test_delete_ended_session_task_is_noop_when_session_already_gone(room, movie):
    with patch("catalog.tasks.delete_ended_session.apply_async"):
        session = Session.objects.create(
            movie=movie,
            room=room,
            start_time=timezone.now() - timedelta(hours=3),
            end_time=timezone.now() - timedelta(hours=1),
            base_price="30.00",
        )
    session_id = str(session.id)
    session.delete()

    delete_ended_session(session_id)
