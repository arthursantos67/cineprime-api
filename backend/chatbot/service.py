import json
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone as django_timezone
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from chatbot.agent import SYSTEM_PROMPT, build_tools, get_llm
from chatbot.models import ChatConversation

MAX_HISTORY_MESSAGES = 20

# Sessions are stored/queried in UTC (settings.TIME_ZONE) but shown to the user in the
# cinema's local timezone, matching the frontend's own display convention (see
# `sessionTimeZone` in frontend/src/components/movies/session-selection.ts).
DISPLAY_TIMEZONE = ZoneInfo("America/Fortaleza")

_SESSION_ID_SUFFIX_PATTERN = re.compile(r"\s*\(id: [0-9a-fA-F-]{36}\)")
_ISO_DATETIME_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?"
)
_ISO_DATE_PATTERN = re.compile(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)")

# Some Groq-hosted Llama models occasionally fall back to Llama 3.1's native
# text-based tool-call syntax (``<function=name>{...}</function>``) instead of
# using the structured ``tool_calls`` channel `bind_tools` expects — this
# recovers the intended call so a model hiccup doesn't leak raw syntax to the
# user or, worse, poison future turns once it's echoed back as conversation
# history.
_TEXTUAL_FUNCTION_CALL_PATTERN = re.compile(
    r"<function=(?P<name>[a-zA-Z_][a-zA-Z0-9_]*)>(?P<args>\{.*?\})</function>",
    re.DOTALL,
)
# Looser detector used only to recognize a *failed* attempt (e.g. truncated/invalid
# JSON that the stricter pattern above won't match) so it still gets replaced with a
# generic reply instead of leaking the opening tag verbatim.
_TEXTUAL_FUNCTION_CALL_ATTEMPT_PATTERN = re.compile(r"<function=[a-zA-Z_][a-zA-Z0-9_]*>")
_FALLBACK_ERROR_REPLY = "Desculpe, não consegui processar sua solicitação. Pode tentar novamente?"

_MONTHS_PT = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
]


def _relative_day_label(local_date):
    today = django_timezone.localtime(django_timezone.now(), DISPLAY_TIMEZONE).date()
    if local_date == today:
        return "hoje"
    if local_date == today + timedelta(days=1):
        return "amanhã"
    return f"{local_date.day} de {_MONTHS_PT[local_date.month - 1]}"


def _format_datetime_for_user(match):
    parsed = datetime.fromisoformat(match.group())
    if django_timezone.is_naive(parsed):
        parsed = django_timezone.make_aware(parsed, ZoneInfo("UTC"))
    local = parsed.astimezone(DISPLAY_TIMEZONE)
    time_label = f"{local.hour}h" if local.minute == 0 else f"{local.hour}h{local.minute:02d}"
    return f"{_relative_day_label(local.date())} às {time_label}"


def _format_date_for_user(match):
    return _relative_day_label(date.fromisoformat(match.group()))


def _humanize_reply_for_user(text):
    """Reformat a deterministic reply for display: natural pt-BR dates/times, no raw
    technical identifiers.

    The exact ID-bearing, ISO-dated text is still what's persisted to conversation
    history in ``handle_message`` so the model can resolve a same-conversation
    follow-up like "ainda tem assento?" against the right session — only what's shown
    to the human is cleaned up here.
    """
    text = _SESSION_ID_SUFFIX_PATTERN.sub("", text)
    text = _ISO_DATETIME_PATTERN.sub(_format_datetime_for_user, text)
    text = _ISO_DATE_PATTERN.sub(_format_date_for_user, text)
    return text


def _parse_textual_function_call(content):
    match = _TEXTUAL_FUNCTION_CALL_PATTERN.search(content or "")
    if not match:
        return None
    try:
        args = json.loads(match.group("args"))
    except json.JSONDecodeError:
        return None
    return {"name": match.group("name"), "args": args}


def _messages_from_history(history):
    restored = []
    for entry in history:
        if entry["role"] == "human":
            restored.append(HumanMessage(content=entry["content"]))
        else:
            restored.append(AIMessage(content=entry["content"]))
    return restored


def _tool_by_name(tools, name):
    for candidate in tools:
        if candidate.name == name:
            return candidate
    return None


def _compose_reply(tool_name, result):
    """Turn one tool's structured result into a deterministic reply + optional handoff action.

    Kept separate from the LLM so the user-facing wording for correctness-critical answers
    (availability, slot questions, ticket scoping) never depends on the model paraphrasing
    data correctly — the model only decides *which* tool to call and with *what* arguments.
    The raw dates/ids this returns are still meant for machine/history consumption; display
    formatting happens afterward in ``_humanize_reply_for_user``.
    """
    if not isinstance(result, dict):
        result = {"items": result}

    error = result.get("error")
    if error == "movie_not_found":
        return (
            f'Não encontrei nenhum filme em cartaz chamado "{result["movie_title"]}".',
            None,
        )
    if error == "session_not_found":
        return "Não encontrei essa sessão.", None
    if error == "invalid_date":
        return "Não entendi a data informada. Pode enviar no formato AAAA-MM-DD?", None

    if result.get("needs_slot") == "date":
        return (
            f'Para qual data você quer ver as sessões de "{result["movie_title"]}"?',
            None,
        )

    if tool_name == "list_now_showing_movies":
        items = result.get("items", result)
        if not items:
            return "No momento não há filmes em cartaz ou em pré-venda.", None
        titles = "\n".join(f"• {movie['title']}" for movie in items)
        return f"Claro! Aqui estão os filmes em cartaz agora:\n{titles}", None

    if tool_name == "list_sessions_for_movie":
        sessions = result.get("sessions", [])
        if not sessions:
            return (
                f'Não encontrei sessões de "{result["movie_title"]}" para {result["date"]}.',
                None,
            )
        lines = "\n".join(
            f"• {s['room']}: {s['start_time']} (id: {s['id']})" for s in sessions
        )
        return (
            f'Encontrei estas sessões de "{result["movie_title"]}" para {result["date"]}:\n{lines}',
            None,
        )

    if tool_name == "check_session_availability":
        if not result.get("bookable", True):
            return "Essa sessão ainda não está disponível para compra.", None
        if result.get("available"):
            action = {
                "action": "redirect",
                "target": "seatmap",
                "session_id": result["session_id"],
            }
            reply = (
                f"Sim! Ainda há {result['available_seats']} assento(s) disponível(is) para essa "
                "sessão. Quer que eu te leve para o mapa de assentos para continuar a compra?"
            )
            return reply, action
        return "Infelizmente essa sessão está esgotada.", None

    if tool_name == "list_my_tickets":
        items = result.get("items", result)
        if not items:
            return "Você ainda não possui ingressos.", None
        lines = "\n".join(
            f"• {t['movie']['title']}, {t['session']['start_time']} (assento {t['seat']['identifier']})"
            for t in items
        )
        return f"Aqui estão seus ingressos:\n{lines}", None

    if tool_name == "next_session_for_user":
        if result.get("has_upcoming") is False:
            return "Você não tem nenhuma sessão futura agendada.", None
        return (
            f'Sua próxima sessão é "{result["movie"]["title"]}", {result["session"]["start_time"]}.',
            None,
        )

    return "Não consegui processar sua solicitação.", None


def handle_message(*, user, conversation_id, message):
    conversation, _ = ChatConversation.objects.get_or_create(
        user=user,
        conversation_id=conversation_id,
        defaults={"messages": []},
    )
    history = conversation.messages[-MAX_HISTORY_MESSAGES:]

    tools = build_tools(user)
    bound_llm = get_llm().bind_tools(tools)

    lc_messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        *_messages_from_history(history),
        HumanMessage(content=message),
    ]
    ai_message = bound_llm.invoke(lc_messages)

    reply_text = ai_message.content or ""
    action = None

    tool_calls = getattr(ai_message, "tool_calls", None) or []
    if not tool_calls:
        fallback_call = _parse_textual_function_call(reply_text)
        if fallback_call is not None:
            tool_calls = [fallback_call]
        elif _TEXTUAL_FUNCTION_CALL_ATTEMPT_PATTERN.search(reply_text):
            # The model attempted a call but we couldn't recover valid JSON args —
            # never leak the raw pseudo-syntax to the user.
            reply_text = _FALLBACK_ERROR_REPLY

    if tool_calls:
        call = tool_calls[0]
        selected_tool = _tool_by_name(tools, call["name"])
        if selected_tool is not None:
            result = selected_tool.invoke(call["args"])
            reply_text, action = _compose_reply(call["name"], result)
        else:
            reply_text = _FALLBACK_ERROR_REPLY

    conversation.messages = history + [
        {"role": "human", "content": message},
        {"role": "ai", "content": reply_text},
    ]
    conversation.save(update_fields=["messages", "updated_at"])

    return {"reply": _humanize_reply_for_user(reply_text), "action": action}
