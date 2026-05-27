from datetime import timedelta
import os
from pathlib import Path
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

# -------------------------------------------------------------------
# Core settings
# -------------------------------------------------------------------

UNSAFE_SECRET_KEYS = {"unsafe-secret-key", "change-me", "changeme"}
LOCAL_ALLOWED_HOSTS = "127.0.0.1,localhost"
LOCAL_CORS_ALLOWED_ORIGINS = "http://localhost:3000"
PRODUCTION_ENVIRONMENTS = {"production", "prod"}


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be an integer.") from exc


def _csv_env(name, default):
    return [
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    ]


DJANGO_ENV = os.getenv("DJANGO_ENV", os.getenv("ENVIRONMENT", "development")).lower()
IS_PRODUCTION = DJANGO_ENV in PRODUCTION_ENVIRONMENTS

SECRET_KEY = os.getenv("SECRET_KEY", "unsafe-secret-key").strip()
DEBUG = _env_bool("DEBUG", default=False)

ALLOWED_HOSTS = _csv_env("ALLOWED_HOSTS", LOCAL_ALLOWED_HOSTS)


def _build_production_configuration_errors():
    errors = []

    secret_key = (os.getenv("SECRET_KEY") or "").strip()
    if not secret_key:
        errors.append("SECRET_KEY is required when DJANGO_ENV=production.")
    elif secret_key in UNSAFE_SECRET_KEYS:
        errors.append("SECRET_KEY must not use a known unsafe development value.")

    if DEBUG:
        errors.append("DEBUG must be False when DJANGO_ENV=production.")

    raw_allowed_hosts = os.getenv("ALLOWED_HOSTS")
    allow_wildcard_hosts = _env_bool("ALLOW_WILDCARD_PRODUCTION_HOSTS")
    unsafe_hosts = {"127.0.0.1", "localhost", "0.0.0.0", "::1"}
    if not raw_allowed_hosts or not ALLOWED_HOSTS:
        errors.append("ALLOWED_HOSTS must define at least one production host.")
    else:
        for host in ALLOWED_HOSTS:
            if host == "*" and not allow_wildcard_hosts:
                errors.append(
                    "ALLOWED_HOSTS must not contain '*' in production unless "
                    "ALLOW_WILDCARD_PRODUCTION_HOSTS=True."
                )
            if host.lower() in unsafe_hosts or host.lower().endswith(".localhost"):
                errors.append(
                    "ALLOWED_HOSTS must not use localhost or loopback hosts in production."
                )

    raw_cors_origins = os.getenv("CORS_ALLOWED_ORIGINS")
    allow_insecure_cors = _env_bool("ALLOW_INSECURE_PRODUCTION_CORS_ORIGINS")
    unsafe_origin_hosts = {"127.0.0.1", "localhost", "0.0.0.0", "::1"}
    if not raw_cors_origins or not CORS_ALLOWED_ORIGINS:
        errors.append("CORS_ALLOWED_ORIGINS must define production frontend origins.")
    else:
        for origin in CORS_ALLOWED_ORIGINS:
            parsed_origin = urlparse(origin)
            hostname = (parsed_origin.hostname or "").lower()
            if "*" in origin:
                errors.append("CORS_ALLOWED_ORIGINS must not contain wildcards.")
            if parsed_origin.scheme != "https" and not allow_insecure_cors:
                errors.append(
                    "CORS_ALLOWED_ORIGINS must use https origins in production unless "
                    "ALLOW_INSECURE_PRODUCTION_CORS_ORIGINS=True."
                )
            if hostname in unsafe_origin_hosts or hostname.endswith(".localhost"):
                errors.append(
                    "CORS_ALLOWED_ORIGINS must not use localhost or loopback origins "
                    "in production."
                )

    return errors


def _validate_production_configuration():
    if not IS_PRODUCTION:
        return

    errors = _build_production_configuration_errors()
    if errors:
        raise ImproperlyConfigured(
            "Invalid production configuration: " + " ".join(errors)
        )

# -------------------------------------------------------------------
# Installed apps
# -------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "django.contrib.postgres",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
]

LOCAL_APPS = [
    "users",
    "catalog",
    "reservations",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# -------------------------------------------------------------------
# Middleware
# -------------------------------------------------------------------

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "cineprime_api.middleware.CorrelationIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# -------------------------------------------------------------------
# URLs and WSGI
# -------------------------------------------------------------------

ROOT_URLCONF = "cineprime_api.urls"
WSGI_APPLICATION = "cineprime_api.wsgi.application"

# -------------------------------------------------------------------
# CORS
# -------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = _csv_env(
    "CORS_ALLOWED_ORIGINS",
    LOCAL_CORS_ALLOWED_ORIGINS,
)

# -------------------------------------------------------------------
# Production security
# -------------------------------------------------------------------

SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", default=IS_PRODUCTION)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", default=IS_PRODUCTION)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", default=IS_PRODUCTION)
SECURE_HSTS_SECONDS = _env_int(
    "SECURE_HSTS_SECONDS",
    31536000 if IS_PRODUCTION else 0,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=IS_PRODUCTION,
)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", default=IS_PRODUCTION)
SECURE_REFERRER_POLICY = os.getenv(
    "SECURE_REFERRER_POLICY",
    "strict-origin-when-cross-origin",
)

_validate_production_configuration()

# -------------------------------------------------------------------
# Templates
# -------------------------------------------------------------------

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# -------------------------------------------------------------------
# Database
# -------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "cineprime"),
        "USER": os.getenv("POSTGRES_USER", "postgres"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
        "HOST": os.getenv("POSTGRES_HOST", "db"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "DISABLE_SERVER_SIDE_CURSORS": True,
    }
}

# -------------------------------------------------------------------
# Authentication
# -------------------------------------------------------------------

AUTH_USER_MODEL = "users.User"

# -------------------------------------------------------------------
# Cache / Redis
# -------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/1")
CACHE_KEY_PREFIX = os.getenv("CACHE_KEY_PREFIX", "cineprime_api")
CACHE_DEFAULT_TIMEOUT = 300

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "KEY_PREFIX": CACHE_KEY_PREFIX,
        "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
    }
}

# -------------------------------------------------------------------
# Password validation
# -------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# -------------------------------------------------------------------
# Internationalization
# -------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# -------------------------------------------------------------------
# Static files
# -------------------------------------------------------------------

STATIC_URL = "static/"

# -------------------------------------------------------------------
# Default primary key field type
# -------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# -------------------------------------------------------------------
# Celery Configuration
# -------------------------------------------------------------------

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1")

CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"

# -------------------------------------------------------------------
# Email
# -------------------------------------------------------------------

DEFAULT_EMAIL_BACKEND = (
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend"
)

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", DEFAULT_EMAIL_BACKEND)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "False") == "True"
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@cineprime.local")
TICKET_CONFIRMATION_EMAIL_SENT_TTL_SECONDS = int(
    os.getenv("TICKET_CONFIRMATION_EMAIL_SENT_TTL_SECONDS", "604800")
)

# -------------------------------------------------------------------
# Django REST Framework
# -------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_THROTTLE_CLASSES": [
        "cineprime_api.throttling.GlobalAnonRateThrottle",
        "cineprime_api.throttling.GlobalUserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON_RATE", "60/minute"),
        "user": os.getenv("THROTTLE_USER_RATE", "120/minute"),
        "login": os.getenv("THROTTLE_LOGIN_RATE", "5/minute"),
        "reservation": os.getenv("THROTTLE_RESERVATION_RATE", "10/minute"),
    },
    "EXCEPTION_HANDLER": "cineprime_api.exception_handler.standardized_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CinePrime API",
    "DESCRIPTION": "Production-oriented REST API for cinema reservation operations.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {"name": "Auth", "description": "Authentication and token issuance endpoints."},
        {
            "name": "Catalog",
            "description": "Movie catalog, genres, rooms, and sessions endpoints.",
        },
        {
            "name": "Reservations",
            "description": "Seat map, temporary reservation, and checkout endpoints.",
        },
        {
            "name": "Users",
            "description": "Authenticated user profile and ticket endpoints.",
        },
    ],
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
            }
        }
    },
    "SECURITY": [{"BearerAuth": []}],
}

# -------------------------------------------------------------------
# Simple JWT
# -------------------------------------------------------------------

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", "30"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_LIFETIME_DAYS", "7"))
    ),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# -------------------------------------------------------------------
# Logging
# -------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {
            "()": "cineprime_api.logging.RequestContextFilter",
        },
    },
    "formatters": {
        "json": {
            "()": "cineprime_api.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["request_context"],
            "formatter": "json",
        },
    },
    "loggers": {
        "cineprime": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "cineprime.observability": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "celery": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}
