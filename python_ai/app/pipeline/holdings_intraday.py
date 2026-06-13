"""Batch holding marks via configured market-data providers (no LLM price extraction)."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.services.market_data.factory import fetch_quotes_sync, quotes_to_api_payloads

logger = logging.getLogger(__name__)

_MAX_SYMBOLS = 15


def fetch_holdings_prices_via_web_search(symbols: list[str]) -> list[dict[str, Any]]:
    """Return quote dicts from the configured market-data provider."""
    normalized = sorted({s.strip().upper() for s in symbols if s and str(s).strip()})[
        :_MAX_SYMBOLS
    ]
    if not normalized:
        return []

    settings = get_settings()
    try:
        quotes = fetch_quotes_sync(normalized, settings)
    except Exception as exc:
        logger.warning("Market data provider failed for holdings refresh: %s", exc)
        return []

    if not quotes:
        logger.warning(
            "No quotes returned for holdings refresh (provider=%s).",
            settings.MARKET_DATA_PROVIDER,
        )
    return quotes_to_api_payloads(quotes)


def _quotes_polygon_only(symbols: list[str], settings: Settings) -> list[dict[str, Any]]:
    """Legacy alias kept for tests importing the old helper name."""
    _ = settings
    return fetch_holdings_prices_via_web_search(symbols)
