from typing import Any
from datetime import datetime, timezone

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
