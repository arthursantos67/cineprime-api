from django.conf import settings

from cineprime_api.localization import DEFAULT_LOCALE, resolve_email_copy

_EMAIL_COPY_EN = {
    "greeting": "Hello {username},",
    "intro": "Thanks for creating a CinePrime account. Confirm your email to finish setting it up:",
    "cta": "Confirm my email",
    "footer": "If you did not create this account, you can safely ignore this message.",
    "thanks": "Thank you for choosing CinePrime.",
    "subject": "Confirm your CinePrime email",
}

EMAIL_COPY = {
    "pt-BR": {
        "greeting": "Olá {username},",
        "intro": "Obrigado por criar uma conta no CinePrime. Confirme seu e-mail para concluir o cadastro:",
        "cta": "Confirmar meu e-mail",
        "footer": "Se você não criou esta conta, pode ignorar esta mensagem com segurança.",
        "thanks": "Obrigado por escolher o CinePrime.",
        "subject": "Confirme seu e-mail no CinePrime",
    },
    "en-US": _EMAIL_COPY_EN,
    "es-ES": _EMAIL_COPY_EN,
    "fr-FR": _EMAIL_COPY_EN,
    "de-DE": _EMAIL_COPY_EN,
    "it-IT": _EMAIL_COPY_EN,
    "zh-CN": _EMAIL_COPY_EN,
    "ja-JP": _EMAIL_COPY_EN,
}


def build_email_verification_email(*, user, token, locale=DEFAULT_LOCALE):
    copy = resolve_email_copy(locale=locale, copy_by_locale=EMAIL_COPY)
    verification_url = f"{settings.FRONTEND_BASE_URL}/verify-email?token={token}"

    body = "\n".join(
        [
            copy["greeting"].format(username=user.username),
            "",
            copy["intro"],
            "",
            f"{copy['cta']}: {verification_url}",
            "",
            copy["footer"],
            "",
            copy["thanks"],
        ]
    )

    return {
        "subject": copy["subject"],
        "body": body,
    }
