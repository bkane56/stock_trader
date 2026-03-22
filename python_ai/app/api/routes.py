from typing import Any
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.core.market_hours import (
    US_EQUITY_MARKET_HOURS_LABEL,
    is_us_equity_trading_hours_eastern,
)
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
from app.schemas.recommendations import (
    MarketResearchResponse,
    MorningBriefingGenerateRequest,
    MorningBriefingResponse,
    RecommendationListResponse,
)

router = APIRouter()
_QUOTE_CACHE: dict[str, dict[str, Any]] = {}


def _parse_symbols_csv(raw: str) -> list[str]:
    return [symbol.strip() for symbol in raw.split(",") if symbol.strip()]


def _fetch_quote(symbol: str) -> dict[str, Any]:
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
        response = httpx.get(
            f"https://api.polygon.io/v2/aggs/ticker/{normalized_symbol}/prev",
            params={"adjusted": "true", "apiKey": polygon_api_key},
            timeout=10.0,
        )
        response.raise_for_status()
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
    except httpx.HTTPError as exc:
        cached = _QUOTE_CACHE.get(normalized_symbol)
        if cached:
            return cached
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Polygon for {normalized_symbol}.",
        ) from exc

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

    payload = {
        "symbol": normalized_symbol,
        "name": normalized_symbol,
        # Intentional: for paper fills we want last available close.
        "price": float(close),
        "previous_close": float(close),
        "currency": "USD",
        "source": "polygon_prev_close",
    }
    _QUOTE_CACHE[normalized_symbol] = payload
    return payload


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/details")
def health_details() -> dict[str, Any]:
    return runtime_health_details()


@router.get("/pipeline/runs/latest")
def get_latest_pipeline_run() -> dict[str, str | int]:
    return latest_pipeline_run_summary()


@router.get("/recommendations", response_model=RecommendationListResponse)
def get_recommendations(
    watchlist: str = Query(default="SPY,QQQ"),
) -> RecommendationListResponse:
    symbols = _parse_symbols_csv(watchlist)
    recommendations = generate_initial_recommendations(symbols=symbols)
    return RecommendationListResponse(
        recommendations=recommendations,
        tools_used=latest_recommendation_tools_used(),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/quotes/{symbol}")
def get_quote(symbol: str) -> dict[str, Any]:
    return _fetch_quote(symbol)


@router.get("/research", response_model=MarketResearchResponse)
def get_market_research(
    holdings: str = Query(default="SPY,QQQ,AAPL"),
    focus: str = Query(default=""),
) -> MarketResearchResponse:
    symbols = _parse_symbols_csv(holdings)
    return generate_market_research(holdings=symbols, focus=focus)


@router.get("/briefings/latest", response_model=MorningBriefingResponse)
def get_latest_morning_briefing() -> MorningBriefingResponse:
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
