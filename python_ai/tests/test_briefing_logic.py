"""Unit tests for pipeline.briefing_logic — portfolio math helpers."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.pipeline.briefing_logic import (
    build_cash_deployment_options,
    build_risk_flags,
    clamp_strategy_growth,
    collect_rotation_sell_candidates,
    default_morning_focus,
    map_research_stance_to_action,
    normalize_symbols,
    should_suppress_new_buys,
    strategy_context_text,
)
from app.schemas.recommendations import (
    DoNotBuyIdea,
    HoldingAction,
    HoldingResearch,
    HoldingSnapshot,
    MarketResearchResponse,
    SectorResearch,
    StockIdea,
)


# ---------------------------------------------------------------------------
# normalize_symbols
# ---------------------------------------------------------------------------


def test_normalize_symbols_deduplicates() -> None:
    assert normalize_symbols(["spy", "SPY", "qqq"]) == ["SPY", "QQQ"]


def test_normalize_symbols_strips_whitespace() -> None:
    assert normalize_symbols([" AAPL ", "  MSFT  "]) == ["AAPL", "MSFT"]


def test_normalize_symbols_skips_empty() -> None:
    assert normalize_symbols(["", "  ", "SPY"]) == ["SPY"]


def test_normalize_symbols_empty_input() -> None:
    assert normalize_symbols([]) == []


# ---------------------------------------------------------------------------
# map_research_stance_to_action
# ---------------------------------------------------------------------------


def test_map_stance_exit_returns_sell() -> None:
    assert map_research_stance_to_action("exit") == "sell"


def test_map_stance_trim() -> None:
    assert map_research_stance_to_action("trim") == "trim"


def test_map_stance_hold() -> None:
    assert map_research_stance_to_action("hold") == "hold"


def test_map_stance_add() -> None:
    assert map_research_stance_to_action("add") == "add"


def test_map_stance_unknown_returns_watch() -> None:
    assert map_research_stance_to_action("bogus") == "watch"


def test_map_stance_case_insensitive() -> None:
    assert map_research_stance_to_action("EXIT") == "sell"


# ---------------------------------------------------------------------------
# default_morning_focus
# ---------------------------------------------------------------------------


def test_default_morning_focus_returns_trimmed() -> None:
    assert default_morning_focus("  tech stocks  ") == "tech stocks"


def test_default_morning_focus_empty_returns_default() -> None:
    result = default_morning_focus("   ")
    assert "market" in result.lower()


# ---------------------------------------------------------------------------
# clamp_strategy_growth
# ---------------------------------------------------------------------------


def test_clamp_strategy_growth_clamps_below_zero() -> None:
    assert clamp_strategy_growth(-10) == 0.0


def test_clamp_strategy_growth_clamps_above_100() -> None:
    assert clamp_strategy_growth(150) == 100.0


def test_clamp_strategy_growth_passes_through_valid() -> None:
    assert clamp_strategy_growth(60.0) == 60.0


# ---------------------------------------------------------------------------
# strategy_context_text (covers the 5 posture branches)
# ---------------------------------------------------------------------------


def test_strategy_context_conservative() -> None:
    text = strategy_context_text(10.0, 90.0)
    assert "conservative" in text


def test_strategy_context_moderate_conservative() -> None:
    text = strategy_context_text(30.0, 70.0)
    assert "moderate-conservative" in text


def test_strategy_context_moderate() -> None:
    text = strategy_context_text(50.0, 50.0)
    assert "moderate" in text
    assert "moderate-" not in text.replace("moderate-conservative", "")


def test_strategy_context_moderate_aggressive() -> None:
    text = strategy_context_text(70.0, 30.0)
    assert "moderate-aggressive" in text


def test_strategy_context_aggressive() -> None:
    text = strategy_context_text(90.0, 10.0)
    assert "aggressive" in text


# ---------------------------------------------------------------------------
# build_risk_flags
# ---------------------------------------------------------------------------


def _minimal_research(**kwargs) -> MarketResearchResponse:  # type: ignore[no-untyped-def]
    defaults: dict = dict(
        holdings_review=[],
        sector_outlook=[],
        stock_ideas=[],
        top_3_buys=[],
        do_not_buy=[],
        macro_summary="stable market conditions",
        generated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return MarketResearchResponse(**defaults)


def test_build_risk_flags_low_when_no_signals() -> None:
    flags = build_risk_flags(_minimal_research())
    assert len(flags) == 1
    assert flags[0].severity == "low"


def test_build_risk_flags_macro_keyword_triggers_medium_flag() -> None:
    flags = build_risk_flags(_minimal_research(macro_summary="inflation is rising"))
    severities = [f.severity for f in flags]
    assert "medium" in severities


def test_build_risk_flags_high_confidence_dnb_triggers_high_flag() -> None:
    dnb = [DoNotBuyIdea(symbol="BBBY", sector="Consumer", reason="Going bankrupt", confidence=0.9)]
    flags = build_risk_flags(_minimal_research(do_not_buy=dnb))
    assert any(f.severity == "high" for f in flags)


def test_build_risk_flags_medium_confidence_dnb_triggers_medium_flag() -> None:
    dnb = [DoNotBuyIdea(symbol="XYZ", sector="Tech", reason="Weak", confidence=0.70)]
    flags = build_risk_flags(_minimal_research(do_not_buy=dnb))
    assert any(f.severity == "medium" for f in flags)


# ---------------------------------------------------------------------------
# build_cash_deployment_options
# ---------------------------------------------------------------------------


def _stock_idea(symbol: str, confidence: float) -> StockIdea:
    return StockIdea(
        symbol=symbol,
        sector="Tech",
        thesis="test thesis",
        risk="medium risk",
        entry_style="immediate",
        confidence=confidence,
    )


def test_build_cash_deployment_options_empty_candidates() -> None:
    result = build_cash_deployment_options(
        candidates=[], deployable_cash_budget=10_000, strategy_growth_pct=60
    )
    assert result == []


def test_build_cash_deployment_options_zero_budget() -> None:
    result = build_cash_deployment_options(
        candidates=[_stock_idea("AAPL", 0.8)], deployable_cash_budget=0, strategy_growth_pct=60
    )
    assert result == []


def test_build_cash_deployment_options_allocates_to_single_candidate() -> None:
    result = build_cash_deployment_options(
        candidates=[_stock_idea("AAPL", 0.8)],
        deployable_cash_budget=10_000,
        strategy_growth_pct=60,
    )
    assert len(result) == 1
    assert result[0].symbol == "AAPL"
    assert result[0].suggested_amount > 0


def test_build_cash_deployment_options_allocates_to_multiple_candidates() -> None:
    candidates = [_stock_idea("AAPL", 0.8), _stock_idea("MSFT", 0.6)]
    result = build_cash_deployment_options(
        candidates=candidates,
        deployable_cash_budget=10_000,
        strategy_growth_pct=60,
    )
    assert len(result) == 2
    assert all(r.suggested_amount > 0 for r in result)
    # Total allocated should not exceed the budget.
    total = sum(r.suggested_amount for r in result)
    assert total <= 10_001  # allow floating point rounding


# ---------------------------------------------------------------------------
# should_suppress_new_buys
# ---------------------------------------------------------------------------


def _holding_action(symbol: str, action: str, confidence: float) -> HoldingAction:
    return HoldingAction(symbol=symbol, action=action, confidence=confidence, reason="test")


def _snapshot(symbol: str, shares: float = 10.0, price: float = 100.0) -> HoldingSnapshot:
    return HoldingSnapshot(symbol=symbol, shares=shares, price=price, market_value=shares * price)


def test_should_suppress_no_snapshot_returns_false() -> None:
    assert should_suppress_new_buys([_holding_action("SPY", "hold", 0.9)], []) is False


def test_should_suppress_sell_action_returns_false() -> None:
    assert (
        should_suppress_new_buys(
            [_holding_action("SPY", "sell", 0.9)],
            [_snapshot("SPY")],
        )
        is False
    )


def test_should_suppress_all_holds_high_confidence_returns_true() -> None:
    assert (
        should_suppress_new_buys(
            [_holding_action("SPY", "hold", 0.85)],
            [_snapshot("SPY")],
        )
        is True
    )


def test_should_suppress_hold_low_confidence_returns_false() -> None:
    assert (
        should_suppress_new_buys(
            [_holding_action("SPY", "hold", 0.40)],
            [_snapshot("SPY")],
        )
        is False
    )
