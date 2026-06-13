"""Tests for portfolio risk rules."""

from app.core.config import Settings
from app.schemas.recommendations import HoldingSnapshot
from app.services.risk_rules import evaluate_portfolio_risk, evaluate_position


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def _row(symbol: str, shares: float, price: float, avg_cost: float) -> HoldingSnapshot:
    return HoldingSnapshot(symbol=symbol, shares=shares, price=price, avg_cost=avg_cost)


def test_overweight_profitable_position_trims():
    row = _row("NVDA", 100, 130.0, 100.0)
    total = 13000.0 + 1000.0
    result = evaluate_position(row, total_portfolio_value=total, settings=_settings())
    assert result.action == "trim"
    assert "take_profit" in result.rule_triggers


def test_overweight_not_profitable_concentration():
    row = _row("NVDA", 200, 100.0, 100.0)
    total = 20000.0 + 1000.0
    result = evaluate_position(row, total_portfolio_value=total, settings=_settings())
    assert result.action == "trim_concentration"


def test_stop_loss_review():
    row = _row("NVDA", 50, 90.0, 100.0)
    result = evaluate_position(row, total_portfolio_value=5000.0, settings=_settings())
    assert result.action == "sell_or_review"
    assert "stop_loss" in result.rule_triggers


def test_normal_hold():
    row = _row("AAPL", 10, 150.0, 140.0)
    result = evaluate_position(row, total_portfolio_value=50000.0, settings=_settings())
    assert result.action == "hold"


def test_insufficient_cash_blocks_buys():
    check = evaluate_portfolio_risk(
        cash_available=100.0,
        holdings_snapshot=[_row("SPY", 10, 400.0, 380.0)],
        settings=_settings(MIN_CASH_RESERVE_PCT=5.0),
    )
    assert check.allow_new_buys is False
    assert check.blocked_reason == "insufficient_cash"
