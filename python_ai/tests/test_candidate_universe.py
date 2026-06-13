"""Tests for candidate universe construction."""

from app.services.candidate_universe import CORE_UNIVERSE, build_candidate_universe


def test_holdings_always_in_universe():
    universe = build_candidate_universe(holdings=["NVDA", "AAPL"], recently_recommended=[])
    assert "NVDA" in universe
    assert "AAPL" in universe
    assert universe.index("NVDA") < universe.index("MSFT")


def test_core_symbols_included():
    universe = build_candidate_universe(holdings=["ZZZZ"], recently_recommended=[])
    for symbol in ("SPY", "MSFT", "AMD"):
        assert symbol in universe


def test_recent_recommendations_included():
    universe = build_candidate_universe(
        holdings=["AAPL"],
        recently_recommended=["CRM", "NOW"],
    )
    assert "CRM" in universe
    assert "NOW" in universe


def test_deduplication():
    universe = build_candidate_universe(
        holdings=["SPY"],
        recently_recommended=["SPY", "QQQ"],
    )
    assert universe.count("SPY") == 1


def test_core_universe_has_expected_size():
    assert len(CORE_UNIVERSE) >= 20
