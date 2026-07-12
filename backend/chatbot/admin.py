from django.contrib import admin

from chatbot.models import ChatConversation


@admin.register(ChatConversation)
class ChatConversationAdmin(admin.ModelAdmin):
    list_display = ("conversation_id", "user", "updated_at", "created_at")
    search_fields = ("conversation_id", "user__email", "user__username")
    readonly_fields = (
        "id",
        "user",
        "conversation_id",
        "messages",
        "created_at",
        "updated_at",
    )
