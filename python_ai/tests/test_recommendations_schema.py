"""Tests for recommendation schemas and LLM-output coercion."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.schemas.recommendations import CashDeploymentOption, StockIdea


def test_stock_idea_entry_style_watch_maps_to_watchlist() -> None:
    idea = StockIdea(
        symbol="TEST",
        sector="Tech",
        thesis="x",
        risk="y",
        entry_style="watch",
        confidence=0.5,
    )
    assert idea.entry_style == "watchlist"


def test_stock_idea_entry_style_unknown_defaults_to_watchlist() -> None:
    idea = StockIdea(
        symbol="TEST",
        sector="Tech",
        thesis="x",
        risk="y",
        entry_style="nonsense",
        confidence=0.5,
    )
    assert idea.entry_style == "watchlist"


def test_cash_deployment_option_entry_style_watch_maps_to_watchlist() -> None:
    opt = CashDeploymentOption(
        symbol="TEST",
        sector="Tech",
        thesis="x",
        risk="y",
        entry_style="watch",
        confidence=0.5,
    )
    assert opt.entry_style == "watchlist"
