"""Tests for deterministic candidate scoring."""

from app.schemas.recommendations import HoldingSnapshot
from app.services.candidate_scoring import score_candidate, score_candidates


def _snapshot(symbol: str, shares: float, price: float, avg_cost: float) -> HoldingSnapshot:
    return HoldingSnapshot(symbol=symbol, shares=shares, price=price, avg_cost=avg_cost)


def test_overweight_holding_gets_diversification_penalty():
    rows = [_snapshot("NVDA", 100, 150.0, 100.0)]
    total = 100 * 150.0 + 5000.0
    score = score_candidate(
        "NVDA",
        holdings_snapshot=rows,
        total_portfolio_value=total,
    )
    assert score.diversification_score <= 0.35
    assert "existing_holding" in score.reason_codes
    assert "already_overweight" in score.reason_codes


def test_non_held_candidate_can_rank_above_held():
    rows = [_snapshot("NVDA", 200, 150.0, 100.0)]
    scores = score_candidates(
        ["NVDA", "CRM"],
        holdings_snapshot=rows,
        cash_available=5000.0,
    )
    assert scores[0].symbol == "CRM"
    assert scores[0].total_score >= scores[1].total_score


def test_new_candidate_reason_code():
    score = score_candidate(
        "CRM",
        holdings_snapshot=[],
        total_portfolio_value=100000.0,
    )
    assert "new_candidate" in score.reason_codes
