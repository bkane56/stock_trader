"""Deterministic portfolio risk rules before LLM explanation."""

from dataclasses import dataclass
from typing import Literal

from app.core.config import Settings, get_settings
from app.schemas.recommendations import HoldingSnapshot

PositionAction = Literal["hold", "trim", "trim_concentration", "sell_or_review"]


@dataclass(frozen=True)
class PositionEvaluation:
    """Result of evaluating one position against risk rules."""

    symbol: str
    action: PositionAction
    rule_triggers: list[str]
    weight_pct: float
    unrealized_gain_pct: float
    unrealized_loss_pct: float


@dataclass(frozen=True)
class PortfolioRiskCheck:
    """Portfolio-level risk gate for new buys and execution."""

    allow_new_buys: bool
    blocked_reason: str | None
    rule_triggers: list[str]


def _position_market_value(row: HoldingSnapshot) -> float:
    return max(0.0, float(row.shares)) * max(0.0, float(row.price))


def _unrealized_gain_pct(row: HoldingSnapshot) -> float:
    cost = max(0.0, float(row.avg_cost))
    price = max(0.0, float(row.price))
    if cost <= 0:
        return 0.0
    return ((price - cost) / cost) * 100.0


def evaluate_position(
    position: HoldingSnapshot,
    *,
    total_portfolio_value: float,
    settings: Settings | None = None,
) -> PositionEvaluation:
    """Evaluate trim/sell/hold for one held position."""
    cfg = settings or get_settings()
    sym = position.symbol.strip().upper()
    weight_pct = (
        (_position_market_value(position) / total_portfolio_value) * 100.0
        if total_portfolio_value > 0
        else 0.0
    )
    gain_pct = _unrealized_gain_pct(position)
    loss_pct = -gain_pct if gain_pct < 0 else 0.0

    rule_triggers: list[str] = []
    action: PositionAction = "hold"

    if gain_pct >= float(cfg.TAKE_PROFIT_GAIN_PCT) and weight_pct > float(
        cfg.TRIM_POSITION_WEIGHT_PCT
    ):
        action = "trim"
        rule_triggers.extend(["take_profit", "overweight"])
    elif loss_pct >= abs(float(cfg.STOP_LOSS_PCT)):
        action = "sell_or_review"
        rule_triggers.append("stop_loss")
    elif weight_pct > float(cfg.MAX_POSITION_WEIGHT_PCT):
        action = "trim_concentration"
        rule_triggers.append("concentration_limit")

    return PositionEvaluation(
        symbol=sym,
        action=action,
        rule_triggers=rule_triggers,
        weight_pct=weight_pct,
        unrealized_gain_pct=gain_pct,
        unrealized_loss_pct=loss_pct,
    )


def evaluate_portfolio_risk(
    *,
    cash_available: float,
    holdings_snapshot: list[HoldingSnapshot],
    trades_today: int = 0,
    settings: Settings | None = None,
) -> PortfolioRiskCheck:
    """Portfolio-level checks for new buys and daily trade limits."""
    cfg = settings or get_settings()
    holdings_value = sum(_position_market_value(row) for row in holdings_snapshot)
    total_value = max(0.0, float(cash_available)) + holdings_value
    reserve_target = total_value * (float(cfg.MIN_CASH_RESERVE_PCT) / 100.0)

    rule_triggers: list[str] = []
    blocked_reason: str | None = None
    allow_new_buys = True

    if cash_available < reserve_target:
        allow_new_buys = False
        blocked_reason = "insufficient_cash"
        rule_triggers.append("insufficient_cash")

    if trades_today >= int(cfg.MAX_TRADES_PER_DAY):
        allow_new_buys = False
        blocked_reason = blocked_reason or "max_trades_per_day"
        rule_triggers.append("max_trades_per_day")

    return PortfolioRiskCheck(
        allow_new_buys=allow_new_buys,
        blocked_reason=blocked_reason,
        rule_triggers=rule_triggers,
    )


def evaluate_all_positions(
    holdings_snapshot: list[HoldingSnapshot],
    *,
    cash_available: float,
    settings: Settings | None = None,
) -> list[PositionEvaluation]:
    """Evaluate every held position."""
    cfg = settings or get_settings()
    holdings_value = sum(_position_market_value(row) for row in holdings_snapshot)
    total_value = max(0.0, float(cash_available)) + holdings_value
    return [
        evaluate_position(row, total_portfolio_value=total_value, settings=cfg)
        for row in holdings_snapshot
        if row.symbol.strip()
    ]
