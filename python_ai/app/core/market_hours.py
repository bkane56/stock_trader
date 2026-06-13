from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

US_EASTERN_TIMEZONE = ZoneInfo("America/New_York")
US_EQUITY_MARKET_OPEN = time(hour=9, minute=0)
US_EQUITY_MARKET_CLOSE = time(hour=16, minute=0)
US_EQUITY_MARKET_HOURS_LABEL = "9:00 AM to 4:00 PM ET on US trading days"

NYSE_HOLIDAYS: frozenset[date] = frozenset(
    date.fromisoformat(value)
    for value in (
        "2025-01-01",
        "2025-01-20",
        "2025-02-17",
        "2025-04-18",
        "2025-05-26",
        "2025-06-19",
        "2025-07-04",
        "2025-09-01",
        "2025-11-27",
        "2025-12-25",
        "2026-01-01",
        "2026-01-19",
        "2026-02-16",
        "2026-04-03",
        "2026-05-25",
        "2026-06-19",
        "2026-07-03",
        "2026-09-07",
        "2026-11-26",
        "2026-12-25",
        "2027-01-01",
        "2027-01-18",
        "2027-02-15",
        "2027-03-26",
        "2027-05-31",
        "2027-06-18",
        "2027-07-05",
        "2027-09-06",
        "2027-11-25",
        "2027-12-24",
        "2028-01-01",
        "2028-01-17",
        "2028-02-21",
        "2028-04-14",
        "2028-05-29",
        "2028-06-19",
        "2028-07-04",
        "2028-09-04",
        "2028-11-23",
        "2028-12-25",
    )
)


def _to_eastern(now: datetime) -> datetime:
    current = now or datetime.now(tz=US_EASTERN_TIMEZONE)
    if current.tzinfo is None:
        current = current.replace(tzinfo=US_EASTERN_TIMEZONE)
    return current.astimezone(US_EASTERN_TIMEZONE)


def is_us_equity_holiday_eastern(now: datetime | None = None) -> bool:
    eastern_now = _to_eastern(now or datetime.now(tz=US_EASTERN_TIMEZONE))
    return eastern_now.date() in NYSE_HOLIDAYS


def is_us_equity_trading_day_eastern(now: datetime | None = None) -> bool:
    eastern_now = _to_eastern(now or datetime.now(tz=US_EASTERN_TIMEZONE))
    if eastern_now.weekday() >= 5:
        return False
    return not is_us_equity_holiday_eastern(eastern_now)


def next_us_equity_session_open_eastern(now: datetime | None = None) -> datetime | None:
    eastern_now = _to_eastern(now or datetime.now(tz=US_EASTERN_TIMEZONE))
    if is_us_equity_trading_hours_eastern(eastern_now):
        return None

    current_time = eastern_now.time()
    if (
        is_us_equity_trading_day_eastern(eastern_now)
        and current_time < US_EQUITY_MARKET_OPEN
    ):
        return datetime.combine(eastern_now.date(), US_EQUITY_MARKET_OPEN, US_EASTERN_TIMEZONE)

    probe_date = eastern_now.date() + timedelta(days=1)
    for _ in range(14):
        if probe_date.weekday() < 5 and probe_date not in NYSE_HOLIDAYS:
            return datetime.combine(probe_date, US_EQUITY_MARKET_OPEN, US_EASTERN_TIMEZONE)
        probe_date += timedelta(days=1)
    return None


def is_us_equity_trading_hours_eastern(now: datetime | None = None) -> bool:
    eastern_now = _to_eastern(now or datetime.now(tz=US_EASTERN_TIMEZONE))
    if not is_us_equity_trading_day_eastern(eastern_now):
        return False
    current_time = eastern_now.time()
    return US_EQUITY_MARKET_OPEN <= current_time < US_EQUITY_MARKET_CLOSE
