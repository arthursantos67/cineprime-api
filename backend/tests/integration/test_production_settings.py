import json
import os
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]

BASE_PRODUCTION_ENV = {
    "DJANGO_ENV": "production",
    "DEBUG": "False",
    "SECRET_KEY": "production-secret-key-for-settings-tests",
    "ALLOWED_HOSTS": "api.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
}

CONTROLLED_ENV_KEYS = {
    "ALLOW_INSECURE_PRODUCTION_CORS_ORIGINS",
    "ALLOW_WILDCARD_PRODUCTION_HOSTS",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "DEBUG",
    "DJANGO_ENV",
    "ENVIRONMENT",
    "SECRET_KEY",
}


def _run_settings_import(overrides, script=None):
    env = os.environ.copy()
    for key in CONTROLLED_ENV_KEYS:
        env.pop(key, None)
    env.update(overrides)
    env["PYTHONPATH"] = str(BACKEND_DIR)

    return subprocess.run(
        [
            sys.executable,
            "-c",
            script or "import cineprime_natal_api.settings",
        ],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        check=False,
        text=True,
    )


def _production_import(overrides, script=None):
    env = BASE_PRODUCTION_ENV | overrides
    return _run_settings_import(env, script=script)


def test_production_requires_secret_key():
    result = _production_import({"SECRET_KEY": ""})

    assert result.returncode != 0
    assert "SECRET_KEY is required" in result.stderr


def test_production_rejects_whitespace_only_secret_key():
    result = _production_import({"SECRET_KEY": "   "})

    assert result.returncode != 0
    assert "SECRET_KEY is required" in result.stderr


def test_production_rejects_unsafe_secret_key():
    result = _production_import({"SECRET_KEY": "unsafe-secret-key"})

    assert result.returncode != 0
    assert "known unsafe development value" in result.stderr


def test_production_rejects_unsafe_secret_key_with_surrounding_whitespace():
    result = _production_import({"SECRET_KEY": " change-me "})

    assert result.returncode != 0
    assert "known unsafe development value" in result.stderr


def test_production_rejects_debug_true():
    result = _production_import({"DEBUG": "True"})

    assert result.returncode != 0
    assert "DEBUG must be False" in result.stderr


def test_production_requires_allowed_hosts():
    result = _production_import({"ALLOWED_HOSTS": ""})

    assert result.returncode != 0
    assert "ALLOWED_HOSTS must define at least one production host" in result.stderr


def test_production_rejects_wildcard_allowed_hosts_by_default():
    result = _production_import({"ALLOWED_HOSTS": "*"})

    assert result.returncode != 0
    assert "ALLOW_WILDCARD_PRODUCTION_HOSTS=True" in result.stderr


def test_production_requires_cors_allowed_origins():
    result = _production_import({"CORS_ALLOWED_ORIGINS": ""})

    assert result.returncode != 0
    assert "CORS_ALLOWED_ORIGINS must define production frontend origins" in result.stderr


def test_production_rejects_insecure_cors_origins_by_default():
    result = _production_import({"CORS_ALLOWED_ORIGINS": "http://app.example.com"})

    assert result.returncode != 0
    assert "CORS_ALLOWED_ORIGINS must use https origins" in result.stderr


def test_valid_production_settings_enable_security_headers():
    script = """
import json
import cineprime_natal_api.settings as settings

print(json.dumps({
    "DEBUG": settings.DEBUG,
    "SECURE_SSL_REDIRECT": settings.SECURE_SSL_REDIRECT,
    "SESSION_COOKIE_SECURE": settings.SESSION_COOKIE_SECURE,
    "CSRF_COOKIE_SECURE": settings.CSRF_COOKIE_SECURE,
    "SECURE_HSTS_SECONDS": settings.SECURE_HSTS_SECONDS,
    "SECURE_HSTS_INCLUDE_SUBDOMAINS": settings.SECURE_HSTS_INCLUDE_SUBDOMAINS,
    "SECURE_HSTS_PRELOAD": settings.SECURE_HSTS_PRELOAD,
    "SECURE_REFERRER_POLICY": settings.SECURE_REFERRER_POLICY,
}))
"""
    result = _production_import({}, script=script)

    assert result.returncode == 0, result.stderr
    settings_values = json.loads(result.stdout)
    assert settings_values == {
        "DEBUG": False,
        "SECURE_SSL_REDIRECT": True,
        "SESSION_COOKIE_SECURE": True,
        "CSRF_COOKIE_SECURE": True,
        "SECURE_HSTS_SECONDS": 31536000,
        "SECURE_HSTS_INCLUDE_SUBDOMAINS": True,
        "SECURE_HSTS_PRELOAD": True,
        "SECURE_REFERRER_POLICY": "strict-origin-when-cross-origin",
    }
