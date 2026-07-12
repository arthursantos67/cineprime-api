from django.db.models import Q
from django.utils import timezone

from reservations.models import Ticket


def build_my_tickets_queryset(user, ticket_type=None):
    """Shared queryset behind the my-tickets endpoint and the chatbot's ticket tools.

    Kept in one place so the two callers can't silently diverge on filtering rules.
    """
    queryset = (
        Ticket.objects.filter(user=user)
        .select_related(
            "session_seat__session__movie",
            "session_seat__session__room",
            "session_seat__seat__row",
        )
        .order_by("-created_at")
    )

    now = timezone.now()

    if ticket_type == "upcoming":
        queryset = queryset.filter(session_seat__session__start_time__gt=now)
    elif ticket_type == "past":
        queryset = queryset.filter(
            Q(session_seat__isnull=True) | Q(session_seat__session__start_time__lte=now)
        )

    return queryset
