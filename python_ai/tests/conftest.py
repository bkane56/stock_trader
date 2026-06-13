"""Pytest configuration and shared fixtures."""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("USE_DETERMINISTIC_PIPELINE", "true")
os.environ.setdefault("MARKET_DATA_PROVIDER", "mock")

import app.services.ai_budget_policy as budget_mod
import app.services.cache as cache_mod
import app.services.decision_ledger as ledger_mod
from app.services.market_data.factory import reset_market_data_provider_cache
from app.services.market_data.quote_cache import clear_quote_cache


@pytest.fixture(autouse=True)
def isolated_service_artifacts(tmp_path, monkeypatch):
    """Use temp dirs for ledger and budget state on every test."""
    ledger_dir = tmp_path / "decision_ledger"
    budget_file = tmp_path / "ai_budget_state.json"
    monkeypatch.setattr(ledger_mod, "_LEDGER_DIR", ledger_dir)
    monkeypatch.setattr(budget_mod, "_BUDGET_STATE_FILE", budget_file)
    cache_mod.recommendation_cache(1)
    cache_mod.candidate_score_cache(1)
    cache_mod.research_summary_cache(1)
    clear_quote_cache()
    reset_market_data_provider_cache()
    yield
