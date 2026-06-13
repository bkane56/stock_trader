"""Alpaca IEX quote provider for low-cost paper-trading marks."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import httpx

from app.services.market_data.base import (
    MarketDataProvider,
    MarketQuote,
    ProviderError,
    normalize_symbol,
)
from app.services.market_data.quote_cache import (
    cache_key,
    cache_ttl_seconds,
    get_cached_quote,
    set_cached_quote,
)

if TYPE_CHECKING:
    from app.core.config import Settings

_ALPACA_DATA_BASE = "https://data.alpaca.markets/v2/stocks"


class AlpacaMarketDataProvider(MarketDataProvider):
    """Fetch latest IEX quotes from Alpaca market data (paper-trading marks only)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._key_id = settings.ALPACA_API_KEY_ID.strip()
        self._secret = settings.ALPACA_API_SECRET_KEY.strip()
        self._feed = settings.ALPACA_DATA_FEED.strip().lower() or "iex"

    @property
    def provider_id(self) -> str:
        return "alpaca_iex"

    @property
    def ui_label(self) -> str:
        return "Alpaca IEX free data"

    def _headers(self) -> dict[str, str]:
        return {
            "APCA-API-KEY-ID": self._key_id,
            "APCA-API-SECRET-KEY": self._secret,
        }

    def _extract_price(self, payload: dict[str, Any]) -> float | None:
        quote = payload.get("quote")
        if isinstance(quote, dict):
            bid = quote.get("bp")
            ask = quote.get("ap")
            if isinstance(bid, (int, float)) and isinstance(ask, (int, float)) and bid > 0 and ask > 0:
                return float((bid + ask) / 2.0)
            for field in ("ap", "bp", "p"):
                value = quote.get(field)
                if isinstance(value, (int, float)) and value > 0:
                    return float(value)

        trade = payload.get("trade")
        if isinstance(trade, dict):
            price = trade.get("p")
            if isinstance(price, (int, float)) and price > 0:
                return float(price)

        latest = payload.get("latestTrade")
        if isinstance(latest, dict):
            price = latest.get("p")
            if isinstance(price, (int, float)) and price > 0:
                return float(price)

        return None

    def _fetch_snapshot_http(self, symbol: str) -> tuple[float, datetime]:
        response = httpx.get(
            f"{_ALPACA_DATA_BASE}/{symbol}/snapshot",
            params={"feed": self._feed},
            headers=self._headers(),
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()
        price = self._extract_price(payload)
        if price is None:
            raise ProviderError(symbol, self.provider_id, "Alpaca snapshot had no usable price.")

        as_of = datetime.now(timezone.utc)
        daily = payload.get("dailyBar")
        if isinstance(daily, dict):
            ts = daily.get("t")
            if isinstance(ts, str):
                try:
                    as_of = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    pass
        return price, as_of

    async def get_quote(self, symbol: str) -> MarketQuote:
        sym = normalize_symbol(symbol)
        if not sym:
            raise ValueError("symbol is required")
        if not self._key_id or not self._secret:
            raise ProviderError(sym, self.provider_id, "Alpaca API credentials are not configured.")

        key = cache_key("alpaca", sym, self._settings)
        ttl = cache_ttl_seconds("alpaca", self._settings)
        cached = get_cached_quote(key, ttl)
        if cached is not None:
            return cached

        try:
            price, as_of = self._fetch_snapshot_http(sym)
        except httpx.HTTPError as exc:
            stale = get_cached_quote(key, ttl * 4)
            if stale is not None:
                return stale.model_copy(
                    update={"notes": "Served from stale cache after Alpaca error."}
                )
            raise ProviderError(sym, self.provider_id, f"Alpaca request failed: {exc}") from exc

        quote = MarketQuote(
            symbol=sym,
            price=price,
            previous_close=price,
            as_of=as_of,
            provider=self.provider_id,
            data_quality="iex_limited",
            is_delayed=True,
            notes="IEX feed via Alpaca; limited/delayed data for paper trading only.",
        )
        set_cached_quote(key, quote)
        return quote

    async def get_quotes(self, symbols: list[str]) -> list[MarketQuote]:
        out: list[MarketQuote] = []
        for symbol in symbols:
            sym = normalize_symbol(symbol)
            if not sym:
                continue
            try:
                out.append(await self.get_quote(sym))
            except (ProviderError, ValueError):
                continue
        return out
