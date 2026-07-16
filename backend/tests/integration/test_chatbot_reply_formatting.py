from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from chatbot.service import DISPLAY_TIMEZONE, _humanize_reply_for_user


def test_humanize_reply_strips_raw_session_id():
    text = "- Sala 2: 2026-07-13T19:00:00+00:00 (id: d8300b56-bf81-4872-9268-2aca890ec098)"
    result = _humanize_reply_for_user(text)

    assert "d8300b56-bf81-4872-9268-2aca890ec098" not in result
    assert "(id:" not in result


def test_humanize_reply_labels_todays_session_as_hoje():
    now_local = timezone.localtime(timezone.now(), DISPLAY_TIMEZONE)
    today_at_seven_pm = now_local.replace(
        hour=19, minute=0, second=0, microsecond=0
    ).astimezone(ZoneInfo("UTC"))

    text = f"- Sala 2: {today_at_seven_pm.isoformat()} (id: d8300b56-bf81-4872-9268-2aca890ec098)"
    result = _humanize_reply_for_user(text)

    assert "hoje às 19h" in result
    assert "2026" not in result


def test_humanize_reply_labels_tomorrows_session_as_amanha():
    now_local = timezone.localtime(timezone.now(), DISPLAY_TIMEZONE)
    tomorrow_at_nine_thirty = (now_local + timedelta(days=1)).replace(
        hour=9, minute=30, second=0, microsecond=0
    ).astimezone(ZoneInfo("UTC"))

    text = f"Sua próxima sessão é \"Matrix\", {tomorrow_at_nine_thirty.isoformat()}."
    result = _humanize_reply_for_user(text)

    assert "amanhã às 9h30" in result


def test_humanize_reply_spells_out_a_far_future_date():
    now_local = timezone.localtime(timezone.now(), DISPLAY_TIMEZONE)
    far_future = (now_local + timedelta(days=30)).date()

    text = f'Encontrei estas sessões de "Matrix" para {far_future.isoformat()}:\n- Sala 1'
    result = _humanize_reply_for_user(text)

    assert far_future.isoformat() not in result
    assert "de" in result


def test_humanize_reply_leaves_plain_text_untouched():
    text = "Você ainda não possui ingressos."
    assert _humanize_reply_for_user(text) == text
