"""Batch holding marks using Serper web search + LLM extraction.

Polygon is used only for previous close when available; current marks come from
web search snippets interpreted by the model (Polygon free tiers are often EOD-only).
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx
from openai import OpenAI

from app.agents.research_agent import ResearchAgent
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

_MAX_SYMBOLS = 15
# Process-local cache to avoid hammering Polygon /prev (free tier → HTTP 429) on repeated UI refreshes.
_POLYGON_PREV_TTL_SEC = 300.0
_polygon_prev_cache: dict[str, tuple[float, float]] = {}


def _polygon_prev_close_http(normalized_symbol: str, polygon_api_key: str) -> float | None:
    try:
        response = httpx.get(
            f"https://api.polygon.io/v2/aggs/ticker/{normalized_symbol}/prev",
            params={"adjusted": "true", "apiKey": polygon_api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", [])
        if not isinstance(results, list) or not results:
            return None
        close = results[0].get("c")
        if isinstance(close, (float, int)):
            return float(close)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError):
        return None
    return None


def _polygon_prev_close_cached(normalized_symbol: str, polygon_api_key: str) -> float | None:
    """Return Polygon previous close with a short TTL to reduce duplicate /prev calls."""
    now = time.time()
    cached = _polygon_prev_cache.get(normalized_symbol)
    if cached is not None and (now - cached[1]) < _POLYGON_PREV_TTL_SEC:
        return cached[0]
    prev = _polygon_prev_close_http(normalized_symbol, polygon_api_key)
    if prev is not None:
        _polygon_prev_cache[normalized_symbol] = (prev, now)
    return prev


def _quotes_polygon_only(symbols: list[str], settings: Settings) -> list[dict[str, Any]]:
    key = settings.POLYGON_API_KEY.strip()
    out: list[dict[str, Any]] = []
    for sym in symbols:
        prev = _polygon_prev_close_cached(sym, key) if key else None
        if prev is None:
            continue
        out.append(
            {
                "symbol": sym,
                "price": prev,
                "previous_close": prev,
                "source": "polygon_prev_close",
            }
        )
    return out


def fetch_holdings_prices_via_web_search(symbols: list[str]) -> list[dict[str, Any]]:
    """Return quote dicts with price from web+LLM when possible, else Polygon prev close."""
    normalized = sorted({s.strip().upper() for s in symbols if s and str(s).strip()})[
        :_MAX_SYMBOLS
    ]
    if not normalized:
        return []

    settings = get_settings()
    polygon_key = settings.POLYGON_API_KEY.strip()
    serper_key = settings.SERPER_API_KEY.strip()
    openai_key = settings.OPENAI_API_KEY.strip()

    if not serper_key or not openai_key:
        logger.warning(
            "Intraday holdings refresh: SERPER_API_KEY or OPENAI_API_KEY missing; "
            "using Polygon previous close only."
        )
        return _quotes_polygon_only(normalized, settings)

    agent = ResearchAgent(settings=settings)
    search_blocks: list[dict[str, Any]] = []
    for sym in normalized:
        raw = agent.execute_tool(
            "search_web",
            {
                "query": f"{sym} stock price today USD last price regular session",
                "limit": 5,
            },
        )
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": "invalid_json", "raw": raw[:2000]}
        search_blocks.append({"symbol": sym, "search": parsed})

    client = OpenAI(api_key=openai_key)
    model = settings.resolved_ai_model()
    user_payload = json.dumps(search_blocks, indent=2)[:100_000]
    try:
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract the most recent US-listed stock price in USD for each ticker from "
                        "web search snippets. Prefer today's regular session or last traded price. "
                        "Return JSON: {\"prices\": {\"TICKER\": number or null}}. "
                        "Use null when a symbol cannot be determined from the text."
                    ),
                },
                {"role": "user", "content": user_payload},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        logger.warning("LLM extraction failed for holdings prices: %s", exc)
        return _quotes_polygon_only(normalized, settings)

    text = (resp.choices[0].message.content or "{}").strip()
    try:
        extracted = json.loads(text)
    except json.JSONDecodeError:
        extracted = {}
    price_map = extracted.get("prices") if isinstance(extracted, dict) else {}
    if not isinstance(price_map, dict):
        price_map = {}

    out: list[dict[str, Any]] = []
    for sym in normalized:
        raw_p = price_map.get(sym)
        if raw_p is None:
            raw_p = price_map.get(sym.upper())
        if raw_p is None:
            for k, v in price_map.items():
                if str(k).strip().upper() == sym:
                    raw_p = v
                    break

        price_f: float | None = None
        if isinstance(raw_p, (float, int)):
            price_f = float(raw_p)
        elif isinstance(raw_p, str):
            m = re.search(r"(\d+(?:\.\d+)?)", raw_p.replace(",", ""))
            if m:
                price_f = float(m.group(1))

        if price_f is not None and price_f > 0:
            out.append(
                {
                    "symbol": sym,
                    "price": price_f,
                    "previous_close": price_f,
                    "source": "web_search_llm",
                }
            )
            continue

        prev = _polygon_prev_close_cached(sym, polygon_key) if polygon_key else None
        if prev is not None:
            out.append(
                {
                    "symbol": sym,
                    "price": prev,
                    "previous_close": prev,
                    "source": "polygon_prev_close_fallback",
                }
            )

    return out
