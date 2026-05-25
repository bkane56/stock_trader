"""FastAPI route definitions for the AI recommendation service.

All endpoints are mounted under the prefix configured in ``main.py``.
"""

from typing import Any
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.core.market_hours import (
    US_EQUITY_MARKET_HOURS_LABEL,
    is_us_equity_trading_hours_eastern,
)
from app.pipeline.holdings_intraday import fetch_holdings_prices_via_web_search
from app.pipeline.service import (
    generate_and_persist_morning_briefing,
    generate_morning_briefing,
    generate_market_research,
    generate_initial_recommendations,
    latest_persisted_morning_briefing,
    latest_recommendation_tools_used,
    latest_pipeline_run_summary,
    runtime_health_details,
)
from app.schemas.holdings_quotes import (
    HoldingsIntradayQuote,
    HoldingsIntradayRequest,
    HoldingsIntradayResponse,
)
from app.schemas.recommendations import (
    MarketResearchResponse,
    MorningBriefingGenerateRequest,
    MorningBriefingResponse,
    RecommendationListResponse,
)

router = APIRouter()
_QUOTE_CACHE: dict[str, dict[str, Any]] = {}
_TRADING_MODE_PATTERN = "^(manual_user|assisted_agent|autonomous_agent)$"


def _parse_symbols_csv(raw: str) -> list[str]:
    """Split a comma-separated ticker string into a list of non-empty symbols."""
    return [symbol.strip() for symbol in raw.split(",") if symbol.strip()]


def _is_autonomous_mode(trading_mode: str) -> bool:
    """Return True when the caller has selected the autonomous agent trading mode."""
    return str(trading_mode).strip() == "autonomous_agent"


def _polygon_prev_close(normalized_symbol: str, polygon_api_key: str) -> float:
    """Return previous session close from Polygon /prev; raises on hard failures."""
    response = httpx.get(
        f"https://api.polygon.io/v2/aggs/ticker/{normalized_symbol}/prev",
        params={"adjusted": "true", "apiKey": polygon_api_key},
        timeout=10.0,
    )
    response.raise_for_status()
    response_payload = response.json()
    results = response_payload.get("results", [])
    if not isinstance(results, list) or not results:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Polygon did not return previous-close data for {normalized_symbol}.",
        )
    previous = results[0]
    close = previous.get("c")
    if not isinstance(close, (float, int)):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Polygon close price unavailable for {normalized_symbol}.",
        )
    return float(close)


def _fetch_quote_previous_close(symbol: str) -> dict[str, Any]:
    """Prior-day close for both price and previous_close (legacy / paper baseline)."""
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("symbol is required")
    settings = get_settings()
    polygon_api_key = settings.POLYGON_API_KEY.strip()
    if not polygon_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="POLYGON_API_KEY is missing for quote retrieval.",
        )

    try:
        close = _polygon_prev_close(normalized_symbol, polygon_api_key)
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 429:
            cached = _QUOTE_CACHE.get(normalized_symbol)
            if cached:
                return cached
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    f"Polygon rate-limited request for {normalized_symbol}. "
                    "Please retry in a few seconds."
                ),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Polygon returned an error for {normalized_symbol}.",
        ) from exc
    except httpx.HTTPError:
        cached = _QUOTE_CACHE.get(normalized_symbol)
        if cached:
            return cached
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Polygon for {normalized_symbol}.",
        )

    payload = {
        "symbol": normalized_symbol,
        "name": normalized_symbol,
        "price": close,
        "previous_close": close,
        "currency": "USD",
        "source": "polygon_prev_close",
    }
    _QUOTE_CACHE[normalized_symbol] = payload
    return payload


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe — returns ``{"status": "ok"}`` when the service is up."""
    return {"status": "ok"}


@router.get("/health/details")
def health_details() -> dict[str, Any]:
    """Readiness probe with provider, model, and last-run metadata."""
    return runtime_health_details()


@router.get("/pipeline/runs/latest")
def get_latest_pipeline_run() -> dict[str, str | int]:
    """Return a summary of the most recent pipeline execution."""
    return latest_pipeline_run_summary()


@router.get("/recommendations", response_model=RecommendationListResponse)
def get_recommendations(
    watchlist: str = Query(default="SPY,QQQ"),
    trading_mode: str = Query(
        default="manual_user",
        pattern=_TRADING_MODE_PATTERN,
        description=(
            "When autonomous_agent, day-trader system prompts are used for the "
            "advisor and research agents."
        ),
    ),
) -> RecommendationListResponse:
    """Generate AI stock recommendations for the given watchlist."""
    symbols = _parse_symbols_csv(watchlist)
    autonomous_mode = _is_autonomous_mode(trading_mode)
    recommendations = generate_initial_recommendations(
        symbols=symbols,
        autonomous_mode=autonomous_mode,
    )
    return RecommendationListResponse(
        recommendations=recommendations,
        tools_used=latest_recommendation_tools_used(),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/quotes/{symbol}")
def get_quote(
    symbol: str,
    price_mode: str = Query(
        default="live",
        pattern="^(live|previous_close)$",
        description=(
            "Polygon is previous session close only on many tiers. "
            "Use POST /quotes/holdings/intraday for web-search-based marks on a refresh cadence."
        ),
    ),
) -> dict[str, Any]:
    """Return the previous-session close price for *symbol* via Polygon."""
    _ = price_mode  # Accepted for API compatibility; both modes map to Polygon /prev only.
    return _fetch_quote_previous_close(symbol)


@router.post("/quotes/holdings/intraday", response_model=HoldingsIntradayResponse)
def post_holdings_intraday_prices(payload: HoldingsIntradayRequest) -> HoldingsIntradayResponse:
    """Fetch intraday prices for a list of holdings via web-search enrichment."""
    rows = fetch_holdings_prices_via_web_search(list(payload.symbols))
    quotes = [HoldingsIntradayQuote(**row) for row in rows]
    return HoldingsIntradayResponse(quotes=quotes)


@router.get("/research", response_model=MarketResearchResponse)
def get_market_research(
    holdings: str = Query(default="SPY,QQQ,AAPL"),
    focus: str = Query(default=""),
    trading_mode: str = Query(
        default="manual_user",
        pattern=_TRADING_MODE_PATTERN,
        description=(
            "When autonomous_agent, day-trader system prompts are used for the research agent."
        ),
    ),
) -> MarketResearchResponse:
    """Run the AI research agent and return sector/holding analysis."""
    symbols = _parse_symbols_csv(holdings)
    autonomous_mode = _is_autonomous_mode(trading_mode)
    return generate_market_research(
        holdings=symbols,
        focus=focus,
        autonomous_mode=autonomous_mode,
    )


@router.get("/briefings/latest", response_model=MorningBriefingResponse)
def get_latest_morning_briefing() -> MorningBriefingResponse:
    """Return the most recently persisted morning briefing, or generate a default one."""
    settings = get_settings()
    default_symbols = _parse_symbols_csv(settings.MORNING_BRIEFING_DEFAULT_HOLDINGS)
    latest = latest_persisted_morning_briefing()
    if latest is not None:
        return latest
    return generate_morning_briefing(
        holdings=default_symbols,
        holdings_snapshot=[],
        cash_available=max(0.0, settings.MORNING_BRIEFING_DEFAULT_CASH),
        strategy_growth_pct=60.0,
        strategy_fixed_pct=40.0,
        focus="general stock market and world news",
        trading_mode="manual_user",
    )


@router.post("/briefings/generate", response_model=MorningBriefingResponse)
def generate_morning_briefing_endpoint(
    payload: MorningBriefingGenerateRequest,
) -> MorningBriefingResponse:
    """Generate a full morning briefing from the caller's portfolio snapshot.

    Blocks autonomous-mode calls outside US equity market hours.
    Set ``persist=true`` to write the result to disk for ``/briefings/latest``.
    """
    if (
        payload.trading_mode == "autonomous_agent"
        and not is_us_equity_trading_hours_eastern()
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Autonomous mode is restricted to US market hours "
                f"({US_EQUITY_MARKET_HOURS_LABEL})."
            ),
        )
    if payload.persist:
        return generate_and_persist_morning_briefing(
            holdings=payload.holdings,
            holdings_snapshot=payload.holdings_snapshot,
            cash_available=payload.cash_available,
            strategy_growth_pct=payload.strategy_growth_pct,
            strategy_fixed_pct=payload.strategy_fixed_pct,
            focus=payload.focus,
            trading_mode=payload.trading_mode,
        )
    return generate_morning_briefing(
        holdings=payload.holdings,
        holdings_snapshot=payload.holdings_snapshot,
        cash_available=payload.cash_available,
        strategy_growth_pct=payload.strategy_growth_pct,
        strategy_fixed_pct=payload.strategy_fixed_pct,
        focus=payload.focus,
        trading_mode=payload.trading_mode,
    )
