import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from catalog.models import Session
from reservations.models import SessionSeat, Ticket
from reservations.services import detach_tickets

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
    default_retry_delay=30,
)
def delete_ended_session(self, session_id: str) -> None:
    from catalog.views import invalidate_session_list_cache

    with transaction.atomic():
        try:
            session = Session.objects.select_for_update().get(id=session_id)
        except Session.DoesNotExist:
            return

        if session.end_time > timezone.now():
            # end_time was pushed back after this task was scheduled; re-arm
            # for the new end_time instead of deleting a still-running session.
            transaction.on_commit(
                lambda: delete_ended_session.apply_async(
                    args=[session_id], eta=session.end_time
                )
            )
            return

        list(
            SessionSeat.objects.select_for_update(of=("self",))
            .filter(session_id=session.id)
            .order_by("id")
            .values_list("id", flat=True)
        )

        detach_tickets(Ticket.objects.filter(session_seat__session=session))
        session.delete()

    invalidate_session_list_cache()
    logger.info("Session auto-deleted after ending | session_id=%s", session_id)
