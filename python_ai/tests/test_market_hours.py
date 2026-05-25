"""Tests for the market hours utility module."""

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.market_hours import (
    US_EASTERN_TIMEZONE,
    US_EQUITY_MARKET_HOURS_LABEL,
    is_us_equity_trading_hours_eastern,
)


def _eastern(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=US_EASTERN_TIMEZONE)


def test_label_constant() -> None:
    assert "9:00" in US_EQUITY_MARKET_HOURS_LABEL
    assert "4:00" in US_EQUITY_MARKET_HOURS_LABEL


def test_weekday_during_market_hours_returns_true() -> None:
    # Monday 2026-05-25 at 10:00 ET
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 25, 10, 0)) is True


def test_before_market_open_returns_false() -> None:
    # Monday 08:59 ET
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 25, 8, 59)) is False


def test_at_market_close_returns_false() -> None:
    # Exactly 16:00 ET (close is exclusive upper bound)
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 25, 16, 0)) is False


def test_after_market_close_returns_false() -> None:
    # 17:00 ET on a weekday
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 25, 17, 0)) is False


def test_saturday_returns_false() -> None:
    # Saturday 2026-05-23 at 12:00 ET
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 23, 12, 0)) is False


def test_sunday_returns_false() -> None:
    # Sunday 2026-05-24 at 12:00 ET
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 24, 12, 0)) is False


def test_no_argument_does_not_raise() -> None:
    # Calling with no args uses the current time — just verify it doesn't raise.
    result = is_us_equity_trading_hours_eastern()
    assert isinstance(result, bool)


def test_naive_datetime_is_treated_as_eastern() -> None:
    # A naive datetime at 10:00 on a weekday should be treated as Eastern.
    naive = datetime(2026, 5, 25, 10, 0)  # no tzinfo
    assert is_us_equity_trading_hours_eastern(naive) is True


def test_at_market_open_returns_true() -> None:
    # 09:00 ET exactly (open is inclusive lower bound)
    assert is_us_equity_trading_hours_eastern(_eastern(2026, 5, 25, 9, 0)) is True
