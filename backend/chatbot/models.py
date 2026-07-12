import uuid

from django.conf import settings
from django.db import models


class ChatConversation(models.Model):
    """Server-side state for one chatbot conversation.

    ``messages`` holds the turn history (``[{"role": "human"|"ai", "content": str}, ...]``)
    so the agent sees prior context on each new message — this is what lets a bare
    follow-up answer (e.g. just a date) resolve a slot the previous turn asked for,
    instead of restarting the intent. DB-backed rather than in-memory because the app
    runs behind multiple gunicorn workers; an in-process cache would lose state whenever
    a follow-up lands on a different worker than the one that asked the question.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_conversations",
    )
    conversation_id = models.CharField(max_length=100)
    messages = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chatbot_conversations"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "conversation_id"],
                name="unique_chat_conversation_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} - {self.conversation_id}"
