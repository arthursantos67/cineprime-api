from django.conf import settings
from django.core import signing

EMAIL_VERIFICATION_SALT = "email-verification"


def generate_email_verification_token(user) -> str:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    return signer.sign(str(user.pk))


def resolve_email_verification_user_id(token: str, *, max_age: int | None = None) -> str | None:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    resolved_max_age = (
        max_age
        if max_age is not None
        else settings.EMAIL_VERIFICATION_TOKEN_MAX_AGE_SECONDS
    )

    try:
        return signer.unsign(token, max_age=resolved_max_age)
    except signing.BadSignature:
        return None


EMAIL_CHANGE_SALT = "email-change"


def generate_email_change_token(user, new_email: str) -> str:
    # "from_email" pins the token to the address the account had when the
    # change was requested: once any email change is applied, every other
    # pending token stops matching and becomes unusable.
    return signing.dumps(
        {"user_id": str(user.pk), "new_email": new_email, "from_email": user.email},
        salt=EMAIL_CHANGE_SALT,
    )


def resolve_email_change_payload(token: str, *, max_age: int | None = None) -> dict | None:
    resolved_max_age = (
        max_age
        if max_age is not None
        else settings.EMAIL_CHANGE_TOKEN_MAX_AGE_SECONDS
    )

    try:
        payload = signing.loads(token, salt=EMAIL_CHANGE_SALT, max_age=resolved_max_age)
    except signing.BadSignature:
        return None

    if not isinstance(payload, dict):
        return None

    if any(key not in payload for key in ("user_id", "new_email", "from_email")):
        return None

    return payload
