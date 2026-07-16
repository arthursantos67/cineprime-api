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
    "completa de ingressos (ex.: 'quais sao meus ingressos', 'meus ingressos ativos').\n"
    "Use get_movie_details para perguntas sobre UM filme especifico (sinopse, elenco, direcao, "
    "classificacao indicativa, duracao, nota media) — funciona tambem para filmes 'em breve', "
    "diferente de list_now_showing_movies e list_sessions_for_movie, que so cobrem filmes em "
    "cartaz/pre-venda. Use list_upcoming_movies quando o usuario perguntar quais filmes estao "
    "'em breve'/'por vir'/'vao estrear'. Use list_movies_by_genre quando o usuario pedir filmes "
    "de um genero especifico (ex.: 'quais filmes de terror tem em cartaz'). Use "
    "get_wallet_balance para perguntas sobre saldo/credito do usuario no CinePrime. Use "
    "register_movie_interest APENAS quando o usuario pedir explicitamente para ser avisado/"
    "notificado sobre a estreia de um filme 'em breve' (ex.: 'me avisa quando X estrear') — essa "
    "ferramenta so funciona para filmes que ainda nao estrearam."
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

    @tool
    def get_movie_details(movie_title: str) -> dict:
        """Retorna sinopse, elenco, direcao, classificacao e nota media de UM filme.

        Busca em qualquer status (inclusive 'em breve'), ao contrario de
        list_now_showing_movies/list_sessions_for_movie.
        """
        return tool_impl.get_movie_details(movie_title)

    @tool
    def list_upcoming_movies() -> list:
        """Lista os filmes anunciados como 'em breve' (ainda nao disponiveis para compra)."""
        return tool_impl.list_upcoming_movies()

    @tool
    def list_movies_by_genre(genre_name: str) -> dict:
        """Lista os filmes em cartaz/pre-venda de um genero especifico (ex.: 'terror', 'comedia')."""
        return tool_impl.list_movies_by_genre(genre_name)

    @tool
    def get_wallet_balance() -> dict:
        """Retorna o saldo de credito interno (carteira CinePrime) do usuario autenticado."""
        return tool_impl.get_wallet_balance(user)

    @tool
    def register_movie_interest(movie_title: str) -> dict:
        """Registra o usuario para ser avisado quando um filme 'em breve' estrear.

        So funciona para filmes que ainda nao estao disponiveis para compra.
        """
        return tool_impl.register_movie_interest(user, movie_title)

    return [
        list_now_showing_movies,
        list_sessions_for_movie,
        check_session_availability,
        list_my_tickets,
        next_session_for_user,
        get_movie_details,
        list_upcoming_movies,
        list_movies_by_genre,
        get_wallet_balance,
        register_movie_interest,
    ]
