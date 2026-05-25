"""Unit tests for recommendation_runner — prompt builders and JSON parsers."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.pipeline import recommendation_runner
from app.pipeline.recommendation_runner import (
    build_research_user_prompt,
    build_user_prompt,
    extract_market_research_from_model_output,
    extract_recommendations_from_model_output,
)


NOW = datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# build_user_prompt
# ---------------------------------------------------------------------------


def test_build_user_prompt_contains_symbols() -> None:
    prompt = build_user_prompt(["SPY", "QQQ"])
    assert "SPY" in prompt
    assert "QQQ" in prompt


def test_build_user_prompt_contains_json_shape() -> None:
    prompt = build_user_prompt(["AAPL"])
    assert "recommendations" in prompt


# ---------------------------------------------------------------------------
# build_research_user_prompt
# ---------------------------------------------------------------------------


def test_build_research_user_prompt_contains_holdings() -> None:
    prompt = build_research_user_prompt(
        holdings=["AAPL", "MSFT"],
        focus="tech",
        min_buy_confidence=0.6,
        strategy_growth_pct=60.0,
        strategy_fixed_pct=40.0,
    )
    assert "AAPL" in prompt
    assert "MSFT" in prompt


def test_build_research_user_prompt_contains_focus() -> None:
    prompt = build_research_user_prompt(
        holdings=["SPY"],
        focus="energy sector",
        min_buy_confidence=0.6,
        strategy_growth_pct=60.0,
        strategy_fixed_pct=40.0,
    )
    assert "energy sector" in prompt


def test_build_research_user_prompt_empty_holdings() -> None:
    prompt = build_research_user_prompt(
        holdings=[],
        focus="",
        min_buy_confidence=0.6,
        strategy_growth_pct=60.0,
        strategy_fixed_pct=40.0,
    )
    # Should not raise; uses (none) for empty holdings.
    assert isinstance(prompt, str)
    assert len(prompt) > 0


# ---------------------------------------------------------------------------
# extract_recommendations_from_model_output
# ---------------------------------------------------------------------------


def _recs_json(*recs: dict) -> str:
    return json.dumps({"recommendations": list(recs)})


def test_extract_recommendations_valid() -> None:
    payload = _recs_json({"symbol": "SPY", "action": "buy", "confidence": 0.8, "rationale": "ok"})
    results = extract_recommendations_from_model_output(payload, ["SPY"], NOW)
    assert len(results) == 1
    assert results[0].symbol == "SPY"
    assert results[0].action == "buy"


def test_extract_recommendations_filters_unknown_symbols() -> None:
    payload = _recs_json(
        {"symbol": "SPY", "action": "hold", "confidence": 0.5, "rationale": "ok"},
        {"symbol": "UNKNOWN", "action": "buy", "confidence": 0.9, "rationale": "ok"},
    )
    results = extract_recommendations_from_model_output(payload, ["SPY"], NOW)
    assert len(results) == 1
    assert results[0].symbol == "SPY"


def test_extract_recommendations_invalid_json_raises() -> None:
    with pytest.raises(Exception):
        extract_recommendations_from_model_output("not json", ["SPY"], NOW)


def test_extract_recommendations_missing_key_raises() -> None:
    with pytest.raises((KeyError, ValueError)):
        extract_recommendations_from_model_output('{"other": []}', ["SPY"], NOW)


def test_extract_recommendations_defaults_empty_rationale() -> None:
    payload = _recs_json({"symbol": "SPY", "action": "hold", "confidence": 0.5, "rationale": ""})
    results = extract_recommendations_from_model_output(payload, ["SPY"], NOW)
    assert results[0].rationale != ""


# ---------------------------------------------------------------------------
# extract_market_research_from_model_output
# ---------------------------------------------------------------------------


def _research_json(**kwargs) -> str:
    defaults = {
        "holdings_review": [],
        "sector_outlook": [],
        "stock_ideas": [],
        "top_3_buys": [],
        "do_not_buy": [],
        "macro_summary": "stable",
    }
    defaults.update(kwargs)
    return json.dumps(defaults)


def test_extract_market_research_minimal() -> None:
    result = extract_market_research_from_model_output(_research_json(), [], 0.6, NOW)
    assert result.macro_summary == "stable"


def test_extract_market_research_fills_missing_holdings() -> None:
    result = extract_market_research_from_model_output(_research_json(), ["SPY", "AAPL"], 0.6, NOW)
    symbols = {r.symbol for r in result.holdings_review}
    assert "SPY" in symbols
    assert "AAPL" in symbols


def test_extract_market_research_parses_holding_from_payload() -> None:
    payload = _research_json(
        holdings_review=[{"symbol": "SPY", "stance": "hold", "confidence": 0.7, "reason": "ok"}]
    )
    result = extract_market_research_from_model_output(payload, ["SPY"], 0.6, NOW)
    assert result.holdings_review[0].symbol == "SPY"
    assert result.holdings_review[0].stance == "hold"


def test_extract_market_research_parses_sector() -> None:
    payload = _research_json(
        sector_outlook=[
            {"sector": "Tech", "ticker": "QQQ", "momentum": "strong", "summary": "good"}
        ]
    )
    result = extract_market_research_from_model_output(payload, [], 0.6, NOW)
    assert len(result.sector_outlook) == 1
    assert result.sector_outlook[0].sector == "Tech"


def test_extract_market_research_skips_invalid_items() -> None:
    payload = _research_json(holdings_review=["not a dict", None, 42])
    result = extract_market_research_from_model_output(payload, [], 0.6, NOW)
    assert result.holdings_review == []
