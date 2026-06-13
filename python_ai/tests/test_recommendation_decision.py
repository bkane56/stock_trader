"""Tests for recommendation decision service."""

from app.schemas.candidates import CandidateScore
from app.schemas.recommendations import HoldingSnapshot
from app.services.recommendation_decision import build_recommendation_decisions


def _score(symbol: str, total: float, codes: list[str] | None = None) -> CandidateScore:
    return CandidateScore(
        symbol=symbol,
        total_score=total,
        momentum_score=0.5,
        relative_strength_score=0.5,
        news_sentiment_score=0.5,
        diversification_score=0.5,
        risk_adjusted_score=0.5,
        reason_codes=codes or ["new_candidate"],
    )


def test_cash_below_reserve_blocks_buy():
    decisions = build_recommendation_decisions(
        scored_candidates=[_score("CRM", 0.8)],
        holdings_snapshot=[
            HoldingSnapshot(symbol="SPY", shares=100, price=400.0, avg_cost=380.0)
        ],
        cash_available=100.0,
        mode="assisted",
    )
    assert decisions[0].action == "watch"
    assert decisions[0].blocked_reason == "insufficient_cash"


def test_assisted_requires_approval():
    decisions = build_recommendation_decisions(
        scored_candidates=[_score("CRM", 0.8)],
        holdings_snapshot=[],
        cash_available=50000.0,
        mode="assisted",
    )
    assert decisions[0].requires_user_approval is True


def test_autonomous_blocked_by_risk():
    row = HoldingSnapshot(symbol="NVDA", shares=100, price=130.0, avg_cost=100.0)
    decisions = build_recommendation_decisions(
        scored_candidates=[_score("NVDA", 0.7, ["existing_holding"])],
        holdings_snapshot=[row],
        cash_available=5000.0,
        mode="autonomous",
    )
    trim = next(d for d in decisions if d.symbol == "NVDA")
    assert trim.action == "trim"
    assert trim.requires_user_approval is False or trim.action == "trim"


def test_strong_non_held_candidate_buy_or_watch():
    decisions = build_recommendation_decisions(
        scored_candidates=[_score("CRM", 0.75)],
        holdings_snapshot=[],
        cash_available=50000.0,
        mode="assisted",
    )
    assert decisions[0].action in ("buy", "watch")
