"""Tests for AI budget policy."""

import json
from pathlib import Path

import app.services.ai_budget_policy as budget_mod
from app.core.config import Settings
from app.services.ai_budget_policy import (
    can_run_research,
    policy_from_settings,
    record_research_run,
)


def test_policy_from_settings():
    policy = policy_from_settings(Settings(MAX_RESEARCH_RUNS_PER_DAY=4))
    assert policy.max_research_runs_per_day == 4


def test_can_run_research_when_fresh(monkeypatch, tmp_path):
    state_file = tmp_path / "ai_budget_state.json"
    monkeypatch.setattr(budget_mod, "_BUDGET_STATE_FILE", state_file)
    allowed, reason = can_run_research(settings=Settings(MAX_RESEARCH_RUNS_PER_DAY=6))
    assert allowed is True
    assert reason is None


def test_cached_research_budget_blocks_after_max(monkeypatch, tmp_path):
    state_file = tmp_path / "ai_budget_state.json"
    monkeypatch.setattr(budget_mod, "_BUDGET_STATE_FILE", state_file)
    settings = Settings(MAX_RESEARCH_RUNS_PER_DAY=1, MIN_MINUTES_BETWEEN_RESEARCH_RUNS=0)
    record_research_run()
    allowed, reason = can_run_research(settings=settings)
    assert allowed is False
    assert reason == "max_research_runs_per_day"


def test_force_refresh_bypasses_daily_cap(monkeypatch, tmp_path):
    state_file = tmp_path / "ai_budget_state.json"
    state_file.write_text(
        json.dumps({"day": budget_mod.date.today().isoformat(), "runs_today": 99}),
        encoding="utf-8",
    )
    monkeypatch.setattr(budget_mod, "_BUDGET_STATE_FILE", state_file)
    allowed, _ = can_run_research(force_refresh=True, settings=Settings())
    assert allowed is True
