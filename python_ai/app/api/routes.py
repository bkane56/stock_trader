from datetime import datetime, timezone

from fastapi import APIRouter, Query

from app.pipeline.service import (
    generate_market_research,
    generate_initial_recommendations,
    latest_recommendation_tools_used,
    latest_pipeline_run_summary,
    runtime_health_details,
)
from app.schemas.recommendations import MarketResearchResponse, RecommendationListResponse

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/details")
def health_details() -> dict[str, str | float | list[str]]:
    return runtime_health_details()


@router.get("/pipeline/runs/latest")
def get_latest_pipeline_run() -> dict[str, str | int]:
    return latest_pipeline_run_summary()


@router.get("/recommendations", response_model=RecommendationListResponse)
def get_recommendations(
    watchlist: str = Query(default="SPY,QQQ"),
) -> RecommendationListResponse:
    symbols = [symbol.strip() for symbol in watchlist.split(",") if symbol.strip()]
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
    symbols = [symbol.strip() for symbol in holdings.split(",") if symbol.strip()]
    return generate_market_research(holdings=symbols, focus=focus)
