"""Pydantic models for auditable recommendation and trade decisions."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class DecisionLedgerEntry(BaseModel):
    """Persisted audit record for recommendations and executions."""

    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    symbol: str
    action: str
    mode: str
    source: Literal["manual", "assisted_ai", "autonomous_ai", "risk_engine"]
    decision: str
    reason_codes: list[str] = Field(default_factory=list)
    rule_triggers: list[str] = Field(default_factory=list)
    ai_summary: str | None = None
    approved_by_user: bool | None = None
    executed: bool = False
    blocked_reason: str | None = None
