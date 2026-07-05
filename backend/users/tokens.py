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
