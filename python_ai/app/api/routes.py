from datetime import datetime, timezone

from fastapi import APIRouter, Query

from app.pipeline.service import (
    generate_initial_recommendations,
    latest_pipeline_run_summary,
)
from app.schemas.recommendations import RecommendationListResponse

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


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
        generated_at=datetime.now(timezone.utc),
    )
