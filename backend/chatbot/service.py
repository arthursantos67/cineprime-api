from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from chatbot.agent import SYSTEM_PROMPT, build_tools, get_llm
from chatbot.models import ChatConversation

MAX_HISTORY_MESSAGES = 20


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
        titles = "\n".join(f"- {movie['title']}" for movie in items)
        return f"Filmes disponíveis:\n{titles}", None

    if tool_name == "list_sessions_for_movie":
        sessions = result.get("sessions", [])
        if not sessions:
            return (
                f'Não encontrei sessões de "{result["movie_title"]}" em {result["date"]}.',
                None,
            )
        lines = "\n".join(
            f"- {s['room']} às {s['start_time']} (id: {s['id']})" for s in sessions
        )
        return (
            f'Sessões de "{result["movie_title"]}" em {result["date"]}:\n{lines}',
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
                "sessão. Quer ir para o mapa de assentos para continuar a compra?"
            )
            return reply, action
        return "Infelizmente essa sessão está esgotada.", None

    if tool_name == "list_my_tickets":
        items = result.get("items", result)
        if not items:
            return "Você ainda não possui ingressos.", None
        lines = "\n".join(
            f"- {t['movie']['title']} em {t['session']['start_time']} (assento {t['seat']['identifier']})"
            for t in items
        )
        return f"Seus ingressos:\n{lines}", None

    if tool_name == "next_session_for_user":
        if result.get("has_upcoming") is False:
            return "Você não tem nenhuma sessão futura agendada.", None
        return (
            f'Sua próxima sessão é "{result["movie"]["title"]}" em {result["session"]["start_time"]}.',
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
    if tool_calls:
        call = tool_calls[0]
        selected_tool = _tool_by_name(tools, call["name"])
        if selected_tool is not None:
            result = selected_tool.invoke(call["args"])
            reply_text, action = _compose_reply(call["name"], result)

    conversation.messages = history + [
        {"role": "human", "content": message},
        {"role": "ai", "content": reply_text},
    ]
    conversation.save(update_fields=["messages", "updated_at"])

    return {"reply": reply_text, "action": action}
