from typing import Any
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query

from app.core.config import get_settings
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


def _parse_symbols_csv(raw: str) -> list[str]:
    return [symbol.strip() for symbol in raw.split(",") if symbol.strip()]


def _fetch_quote(symbol: str) -> dict[str, Any]:
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise ValueError("symbol is required")

    response = httpx.get(
        "https://query1.finance.yahoo.com/v7/finance/quote",
        params={"symbols": normalized_symbol},
        timeout=10.0,
    )
    response.raise_for_status()
    payload = response.json()
    quote_response = payload.get("quoteResponse", {})
    records = quote_response.get("result", [])
    if not isinstance(records, list) or not records:
        raise ValueError(f"No quote data returned for {normalized_symbol}")

    record = records[0]
    if not isinstance(record, dict):
        raise ValueError(f"Invalid quote payload for {normalized_symbol}")

    price = record.get("regularMarketPrice")
    if not isinstance(price, (float, int)):
        raise ValueError(f"Price unavailable for {normalized_symbol}")

    previous_close = record.get("regularMarketPreviousClose")
    previous_close_value = (
        float(previous_close) if isinstance(previous_close, (float, int)) else None
    )
    return {
        "symbol": str(record.get("symbol", normalized_symbol)).upper(),
        "name": str(record.get("longName") or record.get("shortName") or normalized_symbol),
        "price": float(price),
        "previous_close": previous_close_value,
        "currency": str(record.get("currency") or "USD"),
        "source": "yahoo_finance_quote",
    }


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
        cash_available=max(0.0, settings.MORNING_BRIEFING_DEFAULT_CASH),
        focus="general stock market and world news",
    )


@router.post("/briefings/generate", response_model=MorningBriefingResponse)
def generate_morning_briefing_endpoint(
    payload: MorningBriefingGenerateRequest,
) -> MorningBriefingResponse:
    if payload.persist:
        return generate_and_persist_morning_briefing(
            holdings=payload.holdings,
            cash_available=payload.cash_available,
            focus=payload.focus,
        )
    return generate_morning_briefing(
        holdings=payload.holdings,
        cash_available=payload.cash_available,
        focus=payload.focus,
    )
