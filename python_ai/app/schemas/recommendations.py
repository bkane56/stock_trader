from datetime import datetime, timezone

from pydantic import BaseModel, Field


class Recommendation(BaseModel):
    symbol: str
    action: str = Field(pattern="^(buy|sell|hold|consider)$")
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    generated_at: datetime


class RecommendationListResponse(BaseModel):
    recommendations: list[Recommendation]
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
