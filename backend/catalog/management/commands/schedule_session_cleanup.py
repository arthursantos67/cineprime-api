from django.core.management.base import BaseCommand

from catalog.models import Session
from catalog.tasks import delete_ended_session


class Command(BaseCommand):
    help = (
        "One-time backfill that arms auto-deletion for sessions created before "
        "this feature existed. New sessions are scheduled automatically on save(); "
        "run this once after deploying to cover existing rows."
    )

    def handle(self, *args, **options):
        session_ids = list(Session.objects.values_list("id", flat=True))

        for session_id in session_ids:
            delete_ended_session.apply_async(args=[str(session_id)])

        self.stdout.write(
            self.style.SUCCESS(
                f"Scheduled auto-deletion check for {len(session_ids)} session(s)."
            )
        )
