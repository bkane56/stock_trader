"""Factory for configured market-data providers."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.config import Settings, get_settings
from app.services.market_data.alpaca_provider import AlpacaMarketDataProvider
from app.services.market_data.base import MarketDataProvider, MarketQuote, quote_to_api_dict
from app.services.market_data.mock_provider import MockMarketDataProvider
from app.services.market_data.polygon_provider import PolygonMarketDataProvider

if TYPE_CHECKING:
    pass

_FALLBACK_ORDER = ("alpaca", "polygon", "mock")


def _build_provider(name: str, settings: Settings) -> MarketDataProvider:
    normalized = name.strip().lower()
    if normalized == "alpaca":
        return AlpacaMarketDataProvider(settings)
    if normalized == "polygon":
        return PolygonMarketDataProvider(settings)
    if normalized == "mock":
        return MockMarketDataProvider()
    raise ValueError(f"Unsupported market data provider: {name}")


@lru_cache(maxsize=1)
def get_market_data_provider() -> MarketDataProvider:
    """Return the configured primary market-data provider."""
    cfg = get_settings()
    return _build_provider(cfg.MARKET_DATA_PROVIDER, cfg)


def get_market_data_provider_for_settings(settings: Settings) -> MarketDataProvider:
    """Build a provider for explicit settings (tests and overrides)."""
    return _build_provider(settings.MARKET_DATA_PROVIDER, settings)


def market_data_status(settings: Settings | None = None) -> dict[str, str | bool]:
    """Return provider metadata for health checks and UI labels."""
    cfg = settings or get_settings()
    provider = (
        get_market_data_provider_for_settings(cfg)
        if settings is not None
        else get_market_data_provider()
    )
    return {
        "market_data_provider": cfg.MARKET_DATA_PROVIDER.strip().lower(),
        "market_data_mode": cfg.MARKET_DATA_MODE.strip(),
        "market_data_ui_label": provider.ui_label,
        "market_data_fallback_enabled": bool(cfg.ENABLE_MARKET_DATA_FALLBACK),
        "paper_trading_only": True,
    }


def reset_market_data_provider_cache() -> None:
    """Clear cached provider instance (for tests)."""
    get_market_data_provider.cache_clear()


async def fetch_quote_with_fallback(symbol: str, settings: Settings | None = None) -> MarketQuote:
    """Fetch one quote from primary provider, optionally falling back."""
    cfg = settings or get_settings()
    primary_name = cfg.MARKET_DATA_PROVIDER.strip().lower()
    providers_to_try = [primary_name]
    if cfg.ENABLE_MARKET_DATA_FALLBACK:
        for name in _FALLBACK_ORDER:
            if name not in providers_to_try:
                providers_to_try.append(name)

    last_error: Exception | None = None
    for name in providers_to_try:
        try:
            provider = _build_provider(name, cfg)
            return await provider.get_quote(symbol)
        except Exception as exc:  # noqa: BLE001 — try next provider
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    raise ValueError("No market data provider available.")


async def fetch_quotes_with_fallback(
    symbols: list[str],
    settings: Settings | None = None,
) -> list[MarketQuote]:
    """Fetch quotes for many symbols using primary provider with per-symbol fallback."""
    cfg = settings or get_settings()
    out: list[MarketQuote] = []
    for symbol in symbols:
        sym = symbol.strip().upper()
        if not sym:
            continue
        try:
            out.append(await fetch_quote_with_fallback(sym, cfg))
        except Exception:
            continue
    return out


def fetch_quote_sync(symbol: str, settings: Settings | None = None) -> MarketQuote:
    """Sync helper for legacy route handlers."""
    return asyncio.run(fetch_quote_with_fallback(symbol, settings))


def fetch_quotes_sync(
    symbols: list[str],
    settings: Settings | None = None,
) -> list[MarketQuote]:
    """Sync helper for batch quote routes."""
    return asyncio.run(fetch_quotes_with_fallback(symbols, settings))


def quotes_to_api_payloads(quotes: list[MarketQuote]) -> list[dict[str, object]]:
    """Convert provider quotes to REST payloads."""
    return [quote_to_api_dict(quote) for quote in quotes]
