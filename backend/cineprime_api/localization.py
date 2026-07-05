from __future__ import annotations

from collections.abc import Iterable, Mapping


DEFAULT_LOCALE = "pt-BR"
FALLBACK_LOCALE = DEFAULT_LOCALE
SUPPORTED_LOCALES = ("pt-BR", "en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "zh-CN", "ja-JP")

_LOCALE_ALIASES = {
    "pt": "pt-BR",
    "pt-br": "pt-BR",
    "pt_br": "pt-BR",
    "en": "en-US",
    "en-us": "en-US",
    "en_us": "en-US",
    "es": "es-ES",
    "es-es": "es-ES",
    "es_es": "es-ES",
    "fr": "fr-FR",
    "fr-fr": "fr-FR",
    "fr_fr": "fr-FR",
    "de": "de-DE",
    "de-de": "de-DE",
    "de_de": "de-DE",
    "it": "it-IT",
    "it-it": "it-IT",
    "it_it": "it-IT",
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "zh_cn": "zh-CN",
    "ja": "ja-JP",
    "ja-jp": "ja-JP",
    "ja_jp": "ja-JP",
}


def normalize_locale(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip().replace("_", "-").lower()
    if not normalized:
        return None

    return _LOCALE_ALIASES.get(normalized)


def parse_accept_language(value: str | None) -> str:
    if not value:
        return DEFAULT_LOCALE

    weighted_locales: list[tuple[float, int, str]] = []
    for index, part in enumerate(value.split(",")):
        item = part.strip()
        if not item:
            continue

        locale_part, _, params = item.partition(";")
        quality = 1.0

        for param in params.split(";"):
            key, _, raw_value = param.strip().partition("=")
            if key == "q":
                try:
                    quality = max(0.0, min(1.0, float(raw_value)))
                except ValueError:
                    quality = 0.0

        normalized = normalize_locale(locale_part)
        if normalized is not None and quality > 0:
            weighted_locales.append((quality, -index, normalized))

    if not weighted_locales:
        return DEFAULT_LOCALE

    weighted_locales.sort(reverse=True)
    return weighted_locales[0][2]


def get_request_locale(request) -> str:
    query_locale = normalize_locale(request.query_params.get("locale"))
    if query_locale is not None:
        return query_locale

    return parse_accept_language(request.headers.get("Accept-Language"))


def get_context_locale(context: Mapping[str, object] | None) -> str:
    request = (context or {}).get("request")
    if request is None:
        return DEFAULT_LOCALE

    return get_request_locale(request)


def get_translation_value(
    *,
    fallback_value: str,
    field: str,
    locale: str,
    translations: Mapping[str, object] | None,
) -> str:
    translations = translations or {}
    candidate_locales = [locale]
    if DEFAULT_LOCALE not in candidate_locales:
        candidate_locales.append(DEFAULT_LOCALE)

    for candidate_locale in candidate_locales:
        localized = translations.get(candidate_locale)
        if not isinstance(localized, Mapping):
            continue

        value = localized.get(field)
        if isinstance(value, str) and value.strip():
            return value

    return fallback_value


def available_translation_locales(
    *,
    fields: Iterable[str],
    translations: Mapping[str, object] | None,
) -> list[str]:
    locales = [DEFAULT_LOCALE]

    for locale in SUPPORTED_LOCALES:
        localized = (translations or {}).get(locale)
        if locale == DEFAULT_LOCALE or not isinstance(localized, Mapping):
            continue

        if any(isinstance(localized.get(field), str) and localized.get(field).strip() for field in fields):
            locales.append(locale)

    return locales


def normalize_translation_payload(
    value: object,
    *,
    fields: Iterable[str],
) -> dict[str, dict[str, str]]:
    if value in (None, ""):
        return {}

    if not isinstance(value, Mapping):
        raise ValueError("Translations must be an object keyed by locale.")

    allowed_fields = set(fields)
    normalized_translations: dict[str, dict[str, str]] = {}

    for raw_locale, raw_translation in value.items():
        locale = normalize_locale(raw_locale)
        if locale is None or locale not in SUPPORTED_LOCALES:
            supported = ", ".join(SUPPORTED_LOCALES)
            raise ValueError(f"Unsupported locale. Expected one of: {supported}.")

        if not isinstance(raw_translation, Mapping):
            raise ValueError("Each locale translation must be an object.")

        normalized_fields: dict[str, str] = {}
        for field, raw_text in raw_translation.items():
            if field not in allowed_fields:
                allowed = ", ".join(sorted(allowed_fields))
                raise ValueError(f"Unsupported translation field. Expected one of: {allowed}.")

            if raw_text is None:
                normalized_fields[field] = ""
            elif isinstance(raw_text, str):
                normalized_fields[field] = raw_text
            else:
                raise ValueError("Translation values must be strings.")

        normalized_translations[locale] = normalized_fields

    return normalized_translations


def resolve_email_copy(
    *,
    locale: str | None,
    copy_by_locale: Mapping[str, Mapping[str, str]],
) -> Mapping[str, str]:
    normalized_locale = normalize_locale(locale) or DEFAULT_LOCALE
    return copy_by_locale.get(normalized_locale, copy_by_locale[DEFAULT_LOCALE])


def format_email_datetime(value, *, locale: str) -> str:
    _formats = {
        "en-US": "%m/%d/%Y %I:%M %p %Z",
        "de-DE": "%d.%m.%Y %H:%M %Z",
        "zh-CN": "%Y年%m月%d日 %H:%M %Z",
        "ja-JP": "%Y年%m月%d日 %H:%M %Z",
    }
    fmt = _formats.get(locale, "%d/%m/%Y %H:%M %Z")
    return value.strftime(fmt)
