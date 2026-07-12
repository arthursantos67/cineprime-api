from django.conf import settings
from langchain_core.tools import tool
from langchain_groq import ChatGroq

from chatbot import tools as tool_impl

SYSTEM_PROMPT = (
    "Voce e o assistente virtual do CinePrime, uma rede de cinemas. Responda sempre em "
    "portugues do Brasil, de forma breve e cordial.\n"
    "Use SEMPRE as ferramentas disponiveis para responder perguntas sobre filmes, sessoes, "
    "disponibilidade de assentos e ingressos do usuario autenticado — nunca invente esses dados.\n"
    "Ao chamar list_sessions_for_movie, informe a data no formato AAAA-MM-DD. Se o usuario ainda "
    "nao disse a data, chame a ferramenta mesmo assim com date vazio; ela vai indicar que a data "
    "precisa ser perguntada. Quando o usuario responder em seguida apenas com uma data, entenda que "
    "ela se refere ao ultimo filme perguntado na conversa e chame a ferramenta novamente informando "
    "esse filme e a nova data.\n"
    "Para perguntas sobre UM unico proximo compromisso (ex.: 'qual minha proxima sessao', 'qual o "
    "horario do meu proximo filme', 'quando e minha proxima sessao'), use next_session_for_user — "
    "NAO use list_my_tickets para isso. Use list_my_tickets somente quando o usuario pedir a lista "
    "completa de ingressos (ex.: 'quais sao meus ingressos', 'meus ingressos ativos')."
)


def get_llm():
    """Build the Groq chat model used by the agent.

    Uses Groq's free-tier API (``GROQ_API_KEY`` / ``GROQ_MODEL`` env vars) rather than a
    paid provider, per the chatbot issue's requirement to run on a free model.
    """
    return ChatGroq(
        model=settings.GROQ_MODEL,
        api_key=settings.GROQ_API_KEY,
        temperature=0,
    )


def build_tools(user):
    """Build the LangChain tool wrappers for one request, bound to the authenticated user.

    Each tool delegates to a plain function in ``chatbot.tools`` so the underlying logic is
    unit-testable without an LLM, while the LangChain layer only handles schema/dispatch.
    """

    @tool
    def list_now_showing_movies() -> list:
        """Lista os filmes em cartaz ou em pre-venda no cinema no momento."""
        return tool_impl.list_now_showing_movies()

    @tool
    def list_sessions_for_movie(movie_title: str, date: str = "") -> dict:
        """Lista as sessoes de um filme em uma data (formato AAAA-MM-DD).

        Se a data nao for informada, o resultado pede para perguntar a data ao usuario.
        """
        return tool_impl.list_sessions_for_movie(movie_title, date or None)

    @tool
    def check_session_availability(session_id: str) -> dict:
        """Verifica se uma sessao especifica ainda tem assentos disponiveis para compra."""
        return tool_impl.check_session_availability(session_id)

    @tool
    def list_my_tickets() -> list:
        """Lista TODOS os ingressos do usuario autenticado.

        Use quando o usuario pedir a lista completa de ingressos. NAO use esta ferramenta
        para perguntas sobre a proxima sessao especifica — use next_session_for_user.
        """
        return tool_impl.list_my_tickets(user)

    @tool
    def next_session_for_user() -> dict:
        """Retorna APENAS a sessao futura mais proxima do usuario (a proxima, e somente ela).

        Use esta ferramenta para perguntas como 'qual minha proxima sessao' ou 'qual o
        horario do meu proximo filme' — NAO use list_my_tickets para essas perguntas.
        """
        result = tool_impl.next_session_for_user(user)
        if result is None:
            return {"has_upcoming": False}
        return result

    return [
        list_now_showing_movies,
        list_sessions_for_movie,
        check_session_availability,
        list_my_tickets,
        next_session_for_user,
    ]
