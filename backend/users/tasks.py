import logging
import smtplib

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from users.services.email_change_email_service import build_email_change_email
from users.services.email_verification_email_service import (
    build_email_verification_email,
)
from users.services.password_reset_email_service import build_password_reset_email
from users.tokens import generate_email_verification_token

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(smtplib.SMTPException, ConnectionError, TimeoutError, OSError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def send_email_verification_email_task(self, user_id: str, locale: str | None = None) -> None:
    user_model = get_user_model()
    user = user_model.objects.filter(id=user_id).first()
    if user is None:
        logger.warning(
            "Email verification email skipped because user was not found | user_id=%s",
            user_id,
        )
        return

    if user.is_verified:
        logger.info(
            "Email verification email skipped because user is already verified | user_id=%s",
            user_id,
        )
        return

    token = generate_email_verification_token(user)
    email_payload = build_email_verification_email(user=user, token=token, locale=locale)

    try:
        send_mail(
            subject=email_payload["subject"],
            message=email_payload["body"],
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except (smtplib.SMTPException, ConnectionError, TimeoutError, OSError):
        task_id = getattr(self.request, "id", None)
        logger.exception(
            "Email verification email delivery failed | task_id=%s user_id=%s",
            task_id,
            user_id,
            extra={"task_id": task_id, "task_name": self.name, "user_id": user_id},
        )
        raise

    logger.info("Email verification email sent | user_id=%s", user_id)


@shared_task(
    bind=True,
    autoretry_for=(smtplib.SMTPException, ConnectionError, TimeoutError, OSError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def send_password_reset_email_task(self, user_id: str, uid: str, token: str, locale: str | None = None) -> None:
    user_model = get_user_model()
    user = user_model.objects.filter(id=user_id).first()
    if user is None:
        logger.warning(
            "Password reset email skipped because user was not found | user_id=%s",
            user_id,
        )
        return

    email_payload = build_password_reset_email(user=user, uid=uid, token=token, locale=locale)

    try:
        send_mail(
            subject=email_payload["subject"],
            message=email_payload["body"],
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except (smtplib.SMTPException, ConnectionError, TimeoutError, OSError):
        task_id = getattr(self.request, "id", None)
        logger.exception(
            "Password reset email delivery failed | task_id=%s user_id=%s",
            task_id,
            user_id,
            extra={"task_id": task_id, "task_name": self.name, "user_id": user_id},
        )
        raise

    logger.info("Password reset email sent | user_id=%s", user_id)


@shared_task(
    bind=True,
    autoretry_for=(smtplib.SMTPException, ConnectionError, TimeoutError, OSError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def send_email_change_email_task(
    self, user_id: str, new_email: str, token: str, locale: str | None = None
) -> None:
    user_model = get_user_model()
    user = user_model.objects.filter(id=user_id).first()
    if user is None:
        logger.warning(
            "Email change email skipped because user was not found | user_id=%s",
            user_id,
        )
        return

    email_payload = build_email_change_email(user=user, token=token, locale=locale)

    try:
        send_mail(
            subject=email_payload["subject"],
            message=email_payload["body"],
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[new_email],
            fail_silently=False,
        )
    except (smtplib.SMTPException, ConnectionError, TimeoutError, OSError):
        task_id = getattr(self.request, "id", None)
        logger.exception(
            "Email change email delivery failed | task_id=%s user_id=%s",
            task_id,
            user_id,
            extra={"task_id": task_id, "task_name": self.name, "user_id": user_id},
        )
        raise

    logger.info("Email change email sent | user_id=%s", user_id)
