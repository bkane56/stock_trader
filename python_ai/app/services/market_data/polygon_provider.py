"""Polygon previous-close provider for free-tier paper trading."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

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


class PolygonMarketDataProvider(MarketDataProvider):
    """Fetch previous session close from Polygon /prev endpoint."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._api_key = settings.POLYGON_API_KEY.strip()

    @property
    def provider_id(self) -> str:
        return "polygon_prev_close"

    @property
    def ui_label(self) -> str:
        return "Polygon previous close"

    def _fetch_prev_close_http(self, symbol: str) -> float:
        response = httpx.get(
            f"https://api.polygon.io/v2/aggs/ticker/{symbol}/prev",
            params={"adjusted": "true", "apiKey": self._api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", [])
        if not isinstance(results, list) or not results:
            raise ProviderError(symbol, self.provider_id, "Polygon returned no previous close.")
        close = results[0].get("c")
        if not isinstance(close, (float, int)):
            raise ProviderError(symbol, self.provider_id, "Polygon close price unavailable.")
        return float(close)

    async def get_quote(self, symbol: str) -> MarketQuote:
        sym = normalize_symbol(symbol)
        if not sym:
            raise ValueError("symbol is required")
        if not self._api_key:
            raise ProviderError(sym, self.provider_id, "POLYGON_API_KEY is not configured.")

        key = cache_key("polygon", sym, self._settings)
        ttl = cache_ttl_seconds("polygon", self._settings)
        cached = get_cached_quote(key, ttl)
        if cached is not None:
            return cached

        try:
            close = self._fetch_prev_close_http(sym)
        except httpx.HTTPError as exc:
            stale = get_cached_quote(key, ttl * 4)
            if stale is not None:
                return stale.model_copy(
                    update={"notes": "Served from stale cache after Polygon error."}
                )
            raise ProviderError(sym, self.provider_id, f"Polygon request failed: {exc}") from exc

        quote = MarketQuote(
            symbol=sym,
            price=close,
            previous_close=close,
            as_of=datetime.now(timezone.utc),
            provider=self.provider_id,
            data_quality="previous_close",
            is_delayed=True,
            notes="End-of-prior-session close (Polygon free tier).",
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
