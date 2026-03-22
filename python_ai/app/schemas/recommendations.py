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
    company_name: str = ""
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


class HoldingSnapshot(BaseModel):
    symbol: str
    name: str = ""
    sector: str = ""
    shares: float = Field(default=0.0, ge=0.0)
    price: float = Field(default=0.0, ge=0.0)


class CashDeploymentOption(BaseModel):
    symbol: str
    name: str = ""
    sector: str
    thesis: str
    recommendation_reason: str = ""
    risk: str
    entry_style: str = Field(pattern="^(immediate|pullback|watchlist)$")
    confidence: float = Field(ge=0.0, le=1.0)
    suggested_amount: float = Field(default=0.0, ge=0.0)
    suggested_allocation_pct: float = Field(default=0.0, ge=0.0, le=1.0)


class SellLeg(BaseModel):
    symbol: str
    name: str = ""
    shares: float = Field(default=0.0, ge=0.0)
    estimated_price: float = Field(default=0.0, ge=0.0)
    reason: str


class ExecutionRecommendation(BaseModel):
    key: str
    summary: str
    buy: CashDeploymentOption
    sell_leg: SellLeg | None = None
    requires_rotation: bool = False


class RiskFlag(BaseModel):
    category: str
    severity: str = Field(pattern="^(low|medium|high)$")
    summary: str


class MorningBriefingResponse(BaseModel):
    execution_mode: str = Field(
        default="manual",
        pattern="^(manual|assisted|autonomous)$",
    )
    holdings_actions: list[HoldingAction]
    cash_deployment_options: list[CashDeploymentOption]
    cash_available: float = Field(default=0.0, ge=0.0)
    reserve_ratio: float = Field(default=0.1, ge=0.0, le=1.0)
    reserve_cash_target: float = Field(default=0.0, ge=0.0)
    deployable_cash_budget: float = Field(default=0.0, ge=0.0)
    execution_recommendations: list[ExecutionRecommendation] = Field(default_factory=list)
    macro_news_summary: str
    risk_flags: list[RiskFlag]
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class MorningBriefingGenerateRequest(BaseModel):
    holdings: list[str] = Field(default_factory=list)
    holdings_snapshot: list[HoldingSnapshot] = Field(default_factory=list)
    cash_available: float = Field(default=0.0, ge=0.0)
    strategy_growth_pct: float = Field(default=60.0, ge=0.0, le=100.0)
    strategy_fixed_pct: float = Field(default=40.0, ge=0.0, le=100.0)
    focus: str = ""
    persist: bool = True
    trading_mode: str = Field(
        default="manual_user",
        pattern="^(manual_user|assisted_agent|autonomous_agent)$",
    )
