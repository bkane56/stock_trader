from datetime import datetime, time
from zoneinfo import ZoneInfo

US_EASTERN_TIMEZONE = ZoneInfo("America/New_York")
US_EQUITY_MARKET_OPEN = time(hour=9, minute=0)
US_EQUITY_MARKET_CLOSE = time(hour=16, minute=0)
US_EQUITY_MARKET_HOURS_LABEL = "9:00 AM to 4:00 PM ET"


def is_us_equity_trading_hours_eastern(now: datetime | None = None) -> bool:
    current = now or datetime.now(tz=US_EASTERN_TIMEZONE)
    if current.tzinfo is None:
        current = current.replace(tzinfo=US_EASTERN_TIMEZONE)
    eastern_now = current.astimezone(US_EASTERN_TIMEZONE)
    if eastern_now.weekday() >= 5:
        return False
    current_time = eastern_now.time()
    return US_EQUITY_MARKET_OPEN <= current_time < US_EQUITY_MARKET_CLOSE
