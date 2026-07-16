from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from langchain_core.messages import AIMessage

from catalog.models import Movie, MovieStatus, Room, Session
from chatbot.models import ChatConversation
from chatbot.service import handle_message
from reservations.models import Seat, SeatRow, SessionSeat, SessionSeatStatus
from users.models import WalletTransaction

User = get_user_model()


class _FakeBoundLLM:
    """Stands in for ``ChatGroq(...).bind_tools(tools)`` in tests.

    Returns one canned ``AIMessage`` per call (in order) and records the message list it
    was invoked with, so a test can assert the persisted conversation history was actually
    passed back to the model on the next turn.
    """

    def __init__(self, responses, calls):
        self._responses = responses
        self.calls = calls

    def invoke(self, messages):
        self.calls.append(messages)
        return self._responses.pop(0)


class _FakeLLM:
    def __init__(self, responses):
        self._responses = list(responses)
        self._calls = []
        self.bound = None

    def bind_tools(self, tools):
        # A fresh bound LLM is created every turn (mirrors real ChatGroq usage), so the
        # response queue and call log must live here, shared across binds, not copied
        # into each one — otherwise every turn would replay from the same starting queue.
        self.bound = _FakeBoundLLM(self._responses, self._calls)
        return self.bound


def _make_user():
    return User.objects.create_user(
        email="chat@test.com", username="chat_user", password="12345678"
    )


def _make_movie_with_session(title="Duna Parte Dois", start_time=None):
    movie = Movie.objects.create(
        title=title,
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-01-01",
        poster_url="https://example.com/poster.jpg",
    )
    room = Room.objects.create(name=f"Room {title}", capacity=10)
    start_time = start_time or timezone.now() + timedelta(days=1)
    session = Session.objects.create(
        movie=movie,
        room=room,
        start_time=start_time,
        end_time=start_time + timedelta(hours=2),
        base_price="30.00",
    )
    return movie, room, session


@pytest.mark.django_db
def test_multi_turn_slot_filling_resolves_pending_date(monkeypatch):
    user = _make_user()
    movie, room, session = _make_movie_with_session()

    first_turn_response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "list_sessions_for_movie",
                "args": {"movie_title": "Duna", "date": ""},
                "id": "call_1",
            }
        ],
    )
    second_turn_response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "list_sessions_for_movie",
                "args": {
                    "movie_title": "Duna",
                    "date": session.start_time.date().isoformat(),
                },
                "id": "call_2",
            }
        ],
    )
    fake_llm = _FakeLLM([first_turn_response, second_turn_response])
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    first_result = handle_message(
        user=user,
        conversation_id="conv-1",
        message="Quais sessões tem para Duna?",
    )

    assert "data" in first_result["reply"].lower()
    assert first_result["action"] is None

    conversation = ChatConversation.objects.get(user=user, conversation_id="conv-1")
    assert len(conversation.messages) == 2
    assert conversation.messages[0]["role"] == "human"
    assert conversation.messages[1]["role"] == "ai"

    second_result = handle_message(
        user=user,
        conversation_id="conv-1",
        message=session.start_time.date().isoformat(),
    )

    assert movie.title in second_result["reply"]
    # The raw session id must not leak into what the human sees...
    assert str(session.id) not in second_result["reply"]

    # ...but it must still be in the persisted history, since that's what lets the model
    # resolve a same-conversation follow-up like "ainda tem assento?" against the right
    # session on a later turn.
    conversation.refresh_from_db()
    assert str(session.id) in conversation.messages[-1]["content"]

    # The second LLM call must have received the persisted history from the first turn —
    # this is what lets a bare date answer resolve the pending "which date?" question
    # instead of restarting the intent.
    second_call_messages = fake_llm.bound.calls[1]
    human_contents = [m.content for m in second_call_messages if m.type == "human"]
    assert "Quais sessões tem para Duna?" in human_contents

    conversation.refresh_from_db()
    assert len(conversation.messages) == 4


@pytest.mark.django_db
def test_conversation_state_is_scoped_per_user(monkeypatch):
    user_a = _make_user()
    user_b = User.objects.create_user(
        email="b@test.com", username="chat_user_b", password="12345678"
    )

    fake_llm = _FakeLLM([AIMessage(content="Olá!", tool_calls=[])])
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    handle_message(user=user_a, conversation_id="shared-id", message="Oi")

    assert ChatConversation.objects.filter(
        user=user_a, conversation_id="shared-id"
    ).exists()
    assert not ChatConversation.objects.filter(
        user=user_b, conversation_id="shared-id"
    ).exists()


@pytest.mark.django_db
def test_check_session_availability_includes_redirect_action_when_available(
    monkeypatch,
):
    user = _make_user()
    movie, room, session = _make_movie_with_session()
    row = SeatRow.objects.create(room=room, name="A")
    seat = Seat.objects.create(row=row, number=1)
    SessionSeat.objects.create(
        session=session, seat=seat, status=SessionSeatStatus.AVAILABLE
    )

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "check_session_availability",
                        "args": {"session_id": str(session.id)},
                        "id": "call_1",
                    }
                ],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user, conversation_id="conv-avail", message="Tem assento pra essa sessão?"
    )

    assert result["action"] == {
        "action": "redirect",
        "target": "seatmap",
        "session_id": str(session.id),
    }


@pytest.mark.django_db
def test_textual_function_call_fallback_is_executed_like_a_real_tool_call(monkeypatch):
    """Some Groq-hosted Llama models occasionally emit their native pseudo-XML
    tool-call syntax as plain text instead of using the structured tool_calls
    channel. The reply must still resolve to a real answer, not leak that raw
    syntax to the user (see live report against issue #261/#263)."""
    user = _make_user()
    movie, room, session = _make_movie_with_session()

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content=(
                    "Vou verificar novamente.\n"
                    '<function=list_sessions_for_movie>{"movie_title": "'
                    + movie.title
                    + '", "date": "'
                    + session.start_time.date().isoformat()
                    + '"}</function>'
                ),
                tool_calls=[],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user, conversation_id="conv-fallback", message="Quais sessões tem?"
    )

    assert "<function=" not in result["reply"]
    assert movie.title in result["reply"]


@pytest.mark.django_db
def test_unparseable_textual_function_call_falls_back_to_a_generic_reply(monkeypatch):
    user = _make_user()

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content="Vou verificar.\n<function=list_sessions_for_movie>{not valid json</function>",
                tool_calls=[],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user, conversation_id="conv-fallback-bad", message="Quais sessões tem?"
    )

    assert "<function=" not in result["reply"]
    assert result["reply"] == "Desculpe, não consegui processar sua solicitação. Pode tentar novamente?"


@pytest.mark.django_db
def test_get_movie_details_tool_call_returns_synopsis(monkeypatch):
    user = _make_user()
    Movie.objects.create(
        title="Duna Parte Dois",
        synopsis="Paul Atreides se une aos Fremen.",
        duration_minutes=166,
        release_date="2026-01-01",
        poster_url="https://example.com/poster.jpg",
    )

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "get_movie_details",
                        "args": {"movie_title": "Duna"},
                        "id": "call_1",
                    }
                ],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user, conversation_id="conv-details", message="Do que se trata Duna?"
    )

    assert "Paul Atreides se une aos Fremen." in result["reply"]
    assert result["action"] is None


@pytest.mark.django_db
def test_get_wallet_balance_tool_call_reports_sum_in_reais(monkeypatch):
    user = _make_user()
    WalletTransaction.objects.create(user=user, amount="30.00", reason="refund")
    WalletTransaction.objects.create(user=user, amount="-5.00", reason="purchase")

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "get_wallet_balance", "args": {}, "id": "call_1"}
                ],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user, conversation_id="conv-wallet", message="Qual meu saldo?"
    )

    assert "R$ 25,00" in result["reply"]


@pytest.mark.django_db
def test_register_movie_interest_tool_call_confirms_and_rejects_bookable_movie(
    monkeypatch,
):
    user = _make_user()
    Movie.objects.create(
        title="Filme Anunciado",
        synopsis="Synopsis",
        duration_minutes=120,
        release_date="2026-06-01",
        poster_url="https://example.com/poster.jpg",
        status=MovieStatus.EM_BREVE,
    )

    fake_llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "register_movie_interest",
                        "args": {"movie_title": "Filme Anunciado"},
                        "id": "call_1",
                    }
                ],
            )
        ]
    )
    monkeypatch.setattr("chatbot.service.get_llm", lambda: fake_llm)

    result = handle_message(
        user=user,
        conversation_id="conv-interest",
        message="Me avisa quando Filme Anunciado estrear",
    )

    assert "Filme Anunciado" in result["reply"]
    assert "avisad" in result["reply"].lower() or "lembrar" in result["reply"].lower()
