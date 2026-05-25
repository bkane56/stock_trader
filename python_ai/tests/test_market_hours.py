# Tests for the market hours utility module.

import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.market_hours import (
    US_EASTERN_TIMEZONE,
    US_EQUITY_MARKET_HOURS_LABEL,
    is_us_equity_holiday_eastern,
    is_us_equity_trading_day_eastern,
    is_us_equity_trading_hours_eastern,
    next_us_equity_session_open_eastern,
)


def _eastern(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=US_EASTERN_TIMEZONE)


def test_label_constant() -> None:
    assert "9:00" in US_EQUITY_MARKET_HOURS_LABEL
    assert "4:00" in US_EQUITY_MARKET_HOURS_LABEL


def test_weekday_during_market_hours_returns_true() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 1, 15, 10, 0)) is True


def test_memorial_day_2026_is_not_a_trading_day() -> None:
    memorial = _eastern(2026, 5, 25, 10, 0)
    assert is_us_equity_holiday_eastern(memorial) is True
    assert is_us_equity_trading_day_eastern(memorial) is False
    assert is_us_equity_trading_hours_eastern(memorial) is False


def test_before_market_open_returns_false() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 1, 15, 8, 59)) is False


def test_at_market_close_returns_false() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 1, 15, 16, 0)) is False


def test_after_market_close_returns_false() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 1, 15, 17, 0)) is False


def test_saturday_returns_false() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 23, 12, 0)) is False


def test_sunday_returns_false() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 24, 12, 0)) is False


def test_no_argument_does_not_raise() -> None:
    result = is_us_equity_trading_hours_eastern()
    assert isinstance(result, bool)


def test_naive_datetime_is_treated_as_eastern() -> None:
    naive = datetime(2026, 1, 15, 10, 0)
    assert is_us_equity_trading_hours_eastern(naive) is True


def test_at_market_open_returns_true() -> None:
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 1, 15, 9, 0)) is True


def test_next_open_after_memorial_day() -> None:
    next_open = next_us_equity_session_open_eastern(_eastern(2026, 5, 25, 10, 0))
    assert next_open is not None
    assert next_open.date() == date(2026, 5, 26)
    assert next_open.hour == 9
