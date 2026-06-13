"""Combine scores, risk rules, and mode into structured recommendation decisions."""

from typing import Literal

from app.core.config import Settings, get_settings
from app.schemas.candidates import CandidateScore
from app.schemas.recommendations import HoldingSnapshot, RecommendationDecision
from app.services.risk_rules import (
    PortfolioRiskCheck,
    PositionEvaluation,
    evaluate_all_positions,
    evaluate_portfolio_risk,
)

DecisionAction = Literal["buy", "sell", "hold", "trim", "watch"]
TradingMode = Literal["manual", "assisted", "autonomous"]


def _map_position_action(evaluation: PositionEvaluation) -> DecisionAction:
    if evaluation.action == "trim":
        return "trim"
    if evaluation.action == "trim_concentration":
        return "trim"
    if evaluation.action == "sell_or_review":
        return "sell"
    return "hold"


def _requires_user_approval(mode: TradingMode, blocked: bool) -> bool:
    if mode == "manual":
        return False
    if mode == "assisted":
        return True
    return blocked


def build_recommendation_decisions(
    *,
    scored_candidates: list[CandidateScore],
    holdings_snapshot: list[HoldingSnapshot],
    cash_available: float,
    mode: TradingMode,
    trades_today: int = 0,
    ai_summaries: dict[str, str] | None = None,
    settings: Settings | None = None,
) -> list[RecommendationDecision]:
    """Produce deterministic recommendation decisions from scores and risk rules."""
    cfg = settings or get_settings()
    summaries = ai_summaries or {}
    max_buys = int(cfg.MAX_BUY_RECOMMENDATIONS_PER_RUN)
    max_symbols = int(cfg.MAX_SYMBOLS_PER_RESEARCH_RUN)

    portfolio_risk = evaluate_portfolio_risk(
        cash_available=cash_available,
        holdings_snapshot=holdings_snapshot,
        trades_today=trades_today,
        settings=cfg,
    )
    position_evals = {
        row.symbol: row
        for row in evaluate_all_positions(
            holdings_snapshot,
            cash_available=cash_available,
            settings=cfg,
        )
    }

    decisions: list[RecommendationDecision] = []
    buy_count = 0
    held_symbols = {row.symbol.upper() for row in holdings_snapshot}

    for score in scored_candidates[:max_symbols]:
        sym = score.symbol.upper()
        pos_eval = position_evals.get(sym)
        price_row = next(
            (row for row in holdings_snapshot if row.symbol.upper() == sym),
            None,
        )
        estimated_price = float(price_row.price) if price_row else None

        if pos_eval and pos_eval.action != "hold":
            action = _map_position_action(pos_eval)
            blocked = False
            blocked_reason = None
            decisions.append(
                RecommendationDecision(
                    symbol=sym,
                    action=action,
                    confidence=score.total_score,
                    quantity=None,
                    estimated_price=estimated_price,
                    reason_codes=list(score.reason_codes),
                    rule_triggers=list(pos_eval.rule_triggers),
                    ai_summary=summaries.get(sym),
                    requires_user_approval=_requires_user_approval(mode, False),
                    mode=mode,
                    blocked_reason=blocked_reason,
                    executed=False if mode != "autonomous" else not blocked,
                )
            )
            continue

        if sym not in held_symbols and buy_count < max_buys:
            if not portfolio_risk.allow_new_buys:
                decisions.append(
                    RecommendationDecision(
                        symbol=sym,
                        action="watch",
                        confidence=score.total_score,
                        quantity=None,
                        estimated_price=estimated_price,
                        reason_codes=[*score.reason_codes, "insufficient_cash"],
                        rule_triggers=list(portfolio_risk.rule_triggers),
                        ai_summary=summaries.get(sym),
                        requires_user_approval=True,
                        mode=mode,
                        blocked_reason=portfolio_risk.blocked_reason,
                        executed=False,
                    )
                )
                continue

            action: DecisionAction = "buy" if score.total_score >= 0.55 else "watch"
            if action == "buy":
                buy_count += 1
            blocked = mode == "autonomous" and not portfolio_risk.allow_new_buys
            decisions.append(
                RecommendationDecision(
                    symbol=sym,
                    action=action,
                    confidence=score.total_score,
                    quantity=None,
                    estimated_price=estimated_price,
                    reason_codes=list(score.reason_codes),
                    rule_triggers=list(portfolio_risk.rule_triggers),
                    ai_summary=summaries.get(sym),
                    requires_user_approval=_requires_user_approval(mode, blocked),
                    mode=mode,
                    blocked_reason=portfolio_risk.blocked_reason if blocked else None,
                    executed=False if mode != "autonomous" or blocked else True,
                )
            )
            continue

        decisions.append(
            RecommendationDecision(
                symbol=sym,
                action="hold",
                confidence=score.total_score,
                quantity=None,
                estimated_price=estimated_price,
                reason_codes=list(score.reason_codes),
                rule_triggers=pos_eval.rule_triggers if pos_eval else [],
                ai_summary=summaries.get(sym),
                requires_user_approval=_requires_user_approval(mode, False),
                mode=mode,
                blocked_reason=None,
                executed=False,
            )
        )

    return decisions
