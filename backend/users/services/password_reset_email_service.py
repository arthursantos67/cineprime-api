from django.conf import settings

from cineprime_api.localization import DEFAULT_LOCALE, resolve_email_copy

_EMAIL_COPY_EN = {
    "greeting": "Hello {username},",
    "intro": "We received a request to reset your CinePrime password. Use the link below to choose a new one:",
    "cta": "Reset my password",
    "expiry": "This link expires soon and can only be used once.",
    "footer": "If you did not request this, you can safely ignore this message — your password will not change.",
    "thanks": "Thank you for choosing CinePrime.",
    "subject": "Reset your CinePrime password",
}

EMAIL_COPY = {
    "pt-BR": {
        "greeting": "Olá {username},",
        "intro": "Recebemos uma solicitação para redefinir sua senha no CinePrime. Use o link abaixo para escolher uma nova senha:",
        "cta": "Redefinir minha senha",
        "expiry": "Este link expira em breve e só pode ser usado uma vez.",
        "footer": "Se você não solicitou isso, pode ignorar esta mensagem com segurança — sua senha não será alterada.",
        "thanks": "Obrigado por escolher o CinePrime.",
        "subject": "Redefina sua senha no CinePrime",
    },
    "en-US": _EMAIL_COPY_EN,
    "es-ES": _EMAIL_COPY_EN,
    "fr-FR": _EMAIL_COPY_EN,
    "de-DE": _EMAIL_COPY_EN,
    "it-IT": _EMAIL_COPY_EN,
    "zh-CN": _EMAIL_COPY_EN,
    "ja-JP": _EMAIL_COPY_EN,
}


def build_password_reset_email(*, user, uid, token, locale=DEFAULT_LOCALE):
    copy = resolve_email_copy(locale=locale, copy_by_locale=EMAIL_COPY)
    reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?uid={uid}&token={token}"

    body = "\n".join(
        [
            copy["greeting"].format(username=user.username),
            "",
            copy["intro"],
            "",
            f"{copy['cta']}: {reset_url}",
            "",
            copy["expiry"],
            copy["footer"],
            "",
            copy["thanks"],
        ]
    )

    return {
        "subject": copy["subject"],
        "body": body,
    }
