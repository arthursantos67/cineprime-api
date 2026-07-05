from django.conf import settings

from cineprime_api.localization import DEFAULT_LOCALE, resolve_email_copy

_EMAIL_COPY_EN = {
    "greeting": "Hello {username},",
    "intro": (
        "We received a request to change the email address of your CinePrime "
        "account to this one. Confirm the change below:"
    ),
    "cta": "Confirm new email",
    "footer": (
        "If you did not request this change, you can safely ignore this "
        "message and your email will remain unchanged."
    ),
    "thanks": "Thank you for choosing CinePrime.",
    "subject": "Confirm your new CinePrime email",
}

EMAIL_COPY = {
    "pt-BR": {
        "greeting": "Olá {username},",
        "intro": (
            "Recebemos uma solicitação para alterar o e-mail da sua conta "
            "CinePrime para este endereço. Confirme a alteração abaixo:"
        ),
        "cta": "Confirmar novo e-mail",
        "footer": (
            "Se você não solicitou esta alteração, pode ignorar esta mensagem "
            "com segurança e seu e-mail permanecerá o mesmo."
        ),
        "thanks": "Obrigado por escolher o CinePrime.",
        "subject": "Confirme seu novo e-mail no CinePrime",
    },
    "en-US": _EMAIL_COPY_EN,
    "es-ES": _EMAIL_COPY_EN,
    "fr-FR": _EMAIL_COPY_EN,
    "de-DE": _EMAIL_COPY_EN,
    "it-IT": _EMAIL_COPY_EN,
    "zh-CN": _EMAIL_COPY_EN,
    "ja-JP": _EMAIL_COPY_EN,
}


def build_email_change_email(*, user, token, locale=DEFAULT_LOCALE):
    copy = resolve_email_copy(locale=locale, copy_by_locale=EMAIL_COPY)
    confirmation_url = f"{settings.FRONTEND_BASE_URL}/confirm-email-change?token={token}"

    body = "\n".join(
        [
            copy["greeting"].format(username=user.username),
            "",
            copy["intro"],
            "",
            f"{copy['cta']}: {confirmation_url}",
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
