import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cineprime_natal_api.settings")

app = Celery("cineprime_natal_api")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()

from . import celery_signals  # noqa: E402,F401
