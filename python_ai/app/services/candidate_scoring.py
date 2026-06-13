"""Rank candidate symbols with deterministic software logic before LLM review."""

from app.core.config import Settings, get_settings
from app.schemas.candidates import CandidateScore
from app.schemas.recommendations import HoldingSnapshot


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _position_weight_pct(row: HoldingSnapshot, total_value: float) -> float:
    if total_value <= 0:
        return 0.0
    mv = max(0.0, float(row.shares)) * max(0.0, float(row.price))
    return (mv / total_value) * 100.0


def _unrealized_gain_pct(row: HoldingSnapshot) -> float:
    cost = max(0.0, float(row.avg_cost))
    price = max(0.0, float(row.price))
    if cost <= 0:
        return 0.0
    return ((price - cost) / cost) * 100.0


def score_candidate(
    symbol: str,
    *,
    holdings_snapshot: list[HoldingSnapshot],
    total_portfolio_value: float,
    price_by_symbol: dict[str, float] | None = None,
    benchmark_change_pct: float = 0.0,
    news_sentiment_by_symbol: dict[str, float] | None = None,
    settings: Settings | None = None,
) -> CandidateScore:
    """Score one symbol using weighted factors (no LLM calls)."""
    cfg = settings or get_settings()
    sym = symbol.strip().upper()
    prices = price_by_symbol or {}
    sentiments = news_sentiment_by_symbol or {}

    holding_row = next(
        (row for row in holdings_snapshot if row.symbol.upper() == sym),
        None,
    )
    weight_pct = (
        _position_weight_pct(holding_row, total_portfolio_value)
        if holding_row
        else 0.0
    )

    price = prices.get(sym, holding_row.price if holding_row else 0.0)
    momentum_score = _clamp01(0.5 + (benchmark_change_pct / 100.0))
    if price > 0 and holding_row:
        gain = _unrealized_gain_pct(holding_row)
        momentum_score = _clamp01(0.5 + gain / 40.0)

    relative_strength_score = _clamp01(0.45 + benchmark_change_pct / 50.0)
    news_sentiment_score = _clamp01(sentiments.get(sym, 0.5))

    max_weight = float(cfg.MAX_POSITION_WEIGHT_PCT)
    if weight_pct >= max_weight:
        diversification_score = 0.1
    elif weight_pct >= float(cfg.TRIM_POSITION_WEIGHT_PCT):
        diversification_score = 0.35
    elif holding_row:
        diversification_score = 0.55
    else:
        diversification_score = 0.85

    risk_adjusted_score = _clamp01(1.0 - (weight_pct / 100.0))

    total = _clamp01(
        0.30 * momentum_score
        + 0.20 * relative_strength_score
        + 0.20 * news_sentiment_score
        + 0.15 * diversification_score
        + 0.15 * risk_adjusted_score
    )

    reason_codes: list[str] = []
    if holding_row:
        reason_codes.append("existing_holding")
        if weight_pct >= max_weight:
            reason_codes.append("already_overweight")
        gain = _unrealized_gain_pct(holding_row)
        if gain >= float(cfg.TAKE_PROFIT_GAIN_PCT):
            reason_codes.append("profit_available")
    else:
        reason_codes.append("new_candidate")
    if momentum_score >= 0.6:
        reason_codes.append("positive_momentum")
    if diversification_score >= 0.7:
        reason_codes.append("sector_diversification")

    return CandidateScore(
        symbol=sym,
        total_score=total,
        momentum_score=momentum_score,
        relative_strength_score=relative_strength_score,
        news_sentiment_score=news_sentiment_score,
        diversification_score=diversification_score,
        risk_adjusted_score=risk_adjusted_score,
        reason_codes=reason_codes,
    )


def score_candidates(
    symbols: list[str],
    *,
    holdings_snapshot: list[HoldingSnapshot],
    cash_available: float,
    price_by_symbol: dict[str, float] | None = None,
    benchmark_change_pct: float = 0.0,
    news_sentiment_by_symbol: dict[str, float] | None = None,
    settings: Settings | None = None,
) -> list[CandidateScore]:
    """Score and rank all candidate symbols."""
    holdings_value = sum(
        max(0.0, float(row.shares)) * max(0.0, float(row.price))
        for row in holdings_snapshot
    )
    total_value = max(0.0, float(cash_available)) + holdings_value

    scores = [
        score_candidate(
            symbol,
            holdings_snapshot=holdings_snapshot,
            total_portfolio_value=total_value,
            price_by_symbol=price_by_symbol,
            benchmark_change_pct=benchmark_change_pct,
            news_sentiment_by_symbol=news_sentiment_by_symbol,
            settings=settings,
        )
        for symbol in symbols
    ]
    return sorted(scores, key=lambda row: row.total_score, reverse=True)
