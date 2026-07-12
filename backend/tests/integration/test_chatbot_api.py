import pytest
from django.contrib.auth import get_user_model
from langchain_core.messages import AIMessage
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.mark.django_db
def test_message_requires_authentication():
    client = APIClient()

    response = client.post(
        "/api/v1/chatbot/message/",
        {"conversation_id": "conv-1", "message": "Oi"},
        format="json",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_message_requires_non_blank_message():
    user = User.objects.create_user(
        email="chat@test.com", username="chat_user", password="12345678"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/chatbot/message/",
        {"conversation_id": "conv-1", "message": "   "},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_authenticated_message_returns_reply(monkeypatch):
    user = User.objects.create_user(
        email="chat@test.com", username="chat_user", password="12345678"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    class _FakeBoundLLM:
        def invoke(self, messages):
            return AIMessage(content="Olá! Como posso ajudar?", tool_calls=[])

    class _FakeLLM:
        def bind_tools(self, tools):
            return _FakeBoundLLM()

    monkeypatch.setattr("chatbot.service.get_llm", lambda: _FakeLLM())

    response = client.post(
        "/api/v1/chatbot/message/",
        {"conversation_id": "conv-1", "message": "Oi"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["conversation_id"] == "conv-1"
    assert response.data["reply"] == "Olá! Como posso ajudar?"
    assert response.data["action"] is None
