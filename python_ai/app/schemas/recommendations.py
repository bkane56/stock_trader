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
    tools_used: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class HoldingResearch(BaseModel):
    symbol: str
    stance: str = Field(pattern="^(add|hold|trim|exit|watch)$")
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class SectorResearch(BaseModel):
    sector: str
    ticker: str
    momentum: str = Field(pattern="^(strong|neutral|weak)$")
    summary: str


class StockIdea(BaseModel):
    symbol: str
    sector: str
    thesis: str
    risk: str
    entry_style: str = Field(pattern="^(immediate|pullback|watchlist)$")
    confidence: float = Field(ge=0.0, le=1.0)


class DoNotBuyIdea(BaseModel):
    symbol: str
    sector: str
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)


class MarketResearchResponse(BaseModel):
    holdings_review: list[HoldingResearch]
    sector_outlook: list[SectorResearch]
    stock_ideas: list[StockIdea]
    top_3_buys: list[StockIdea]
    do_not_buy: list[DoNotBuyIdea]
    macro_summary: str
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class HoldingAction(BaseModel):
    symbol: str
    action: str = Field(pattern="^(sell|trim|hold|add|watch)$")
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class CashDeploymentOption(BaseModel):
    symbol: str
    sector: str
    thesis: str
    risk: str
    entry_style: str = Field(pattern="^(immediate|pullback|watchlist)$")
    confidence: float = Field(ge=0.0, le=1.0)


class RiskFlag(BaseModel):
    category: str
    severity: str = Field(pattern="^(low|medium|high)$")
    summary: str


class MorningBriefingResponse(BaseModel):
    execution_mode: str = Field(default="manual", pattern="^(manual)$")
    holdings_actions: list[HoldingAction]
    cash_deployment_options: list[CashDeploymentOption]
    macro_news_summary: str
    risk_flags: list[RiskFlag]
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class MorningBriefingGenerateRequest(BaseModel):
    holdings: list[str] = Field(default_factory=list)
    cash_available: float = Field(default=0.0, ge=0.0)
    focus: str = ""
    persist: bool = True
