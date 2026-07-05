from cineprime_api.localization import DEFAULT_LOCALE, resolve_email_copy

_EMAIL_COPY_EN = {
    "greeting": "Hello {username},",
    "intro": (
        "A request was made to change the email address of your CinePrime "
        "account. The change only takes effect after the new address "
        "confirms it."
    ),
    "warning": (
        "If you did not request this change, change your password "
        "immediately and contact our support."
    ),
    "thanks": "Thank you for choosing CinePrime.",
    "subject": "Email change requested on your CinePrime account",
}

EMAIL_COPY = {
    "pt-BR": {
        "greeting": "Olá {username},",
        "intro": (
            "Foi feita uma solicitação para alterar o e-mail da sua conta "
            "CinePrime. A troca só é aplicada após a confirmação pelo novo "
            "endereço."
        ),
        "warning": (
            "Se você não solicitou esta alteração, troque sua senha "
            "imediatamente e entre em contato com nosso suporte."
        ),
        "thanks": "Obrigado por escolher o CinePrime.",
        "subject": "Solicitação de troca de e-mail na sua conta CinePrime",
    },
    "en-US": _EMAIL_COPY_EN,
    "es-ES": _EMAIL_COPY_EN,
    "fr-FR": _EMAIL_COPY_EN,
    "de-DE": _EMAIL_COPY_EN,
    "it-IT": _EMAIL_COPY_EN,
    "zh-CN": _EMAIL_COPY_EN,
    "ja-JP": _EMAIL_COPY_EN,
}


def build_email_change_notice_email(*, user, locale=DEFAULT_LOCALE):
    copy = resolve_email_copy(locale=locale, copy_by_locale=EMAIL_COPY)

    body = "\n".join(
        [
            copy["greeting"].format(username=user.username),
            "",
            copy["intro"],
            "",
            copy["warning"],
            "",
            copy["thanks"],
        ]
    )

    return {
        "subject": copy["subject"],
        "body": body,
    }
