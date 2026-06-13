"""Pydantic models for deterministic candidate scoring."""

from pydantic import BaseModel, Field


class CandidateScore(BaseModel):
    """Deterministic score for a single ticker candidate."""

    symbol: str
    total_score: float = Field(ge=0.0, le=1.0)
    momentum_score: float = Field(ge=0.0, le=1.0)
    relative_strength_score: float = Field(ge=0.0, le=1.0)
    news_sentiment_score: float = Field(ge=0.0, le=1.0)
    diversification_score: float = Field(ge=0.0, le=1.0)
    risk_adjusted_score: float = Field(ge=0.0, le=1.0)
    reason_codes: list[str] = Field(default_factory=list)
