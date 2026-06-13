"""TTL and session-bound caching for market quotes."""

from __future__ import annotations

import time
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from app.services.market_data.base import MarketQuote

if TYPE_CHECKING:
    from app.core.config import Settings


_store: dict[str, tuple[MarketQuote, float]] = {}


def _minute_bucket(minutes: int) -> str:
    now = datetime.now(timezone.utc)
    bucket = (now.hour * 60 + now.minute) // max(1, minutes)
    return f"{now.date().isoformat()}:{bucket}"


def _trading_day_key() -> str:
    return date.today().isoformat()


def cache_key(provider: str, symbol: str, settings: Settings) -> str:
    """Build provider-scoped cache key."""
    normalized = symbol.strip().upper()
    if provider == "polygon":
        return f"{provider}:{normalized}:{_trading_day_key()}"
    minutes = max(1, int(settings.MARKET_DATA_CACHE_MINUTES))
    return f"{provider}:{normalized}:{_minute_bucket(minutes)}"


def cache_ttl_seconds(provider: str, settings: Settings) -> float:
    """Return TTL for a provider cache entry."""
    if provider == "polygon":
        return 86_400.0
    if provider == "mock":
        return 0.0
    return max(60.0, float(settings.MARKET_DATA_CACHE_MINUTES) * 60.0)


def get_cached_quote(key: str, ttl_seconds: float) -> MarketQuote | None:
    """Return cached quote when still fresh."""
    if ttl_seconds <= 0:
        return None
    entry = _store.get(key)
    if entry is None:
        return None
    quote, stored_at = entry
    if time.time() - stored_at > ttl_seconds:
        _store.pop(key, None)
        return None
    return quote.model_copy(update={"cache_hit": True})


def set_cached_quote(key: str, quote: MarketQuote) -> None:
    """Store quote with current timestamp."""
    _store[key] = (quote.model_copy(update={"cache_hit": False}), time.time())


def clear_quote_cache() -> None:
    """Clear process-local quote cache (for tests)."""
    _store.clear()
