"""Tests for decision ledger persistence."""

from pathlib import Path

import app.services.decision_ledger as ledger_mod
from app.schemas.recommendations import RecommendationDecision
from app.services.decision_ledger import append_decision, list_decisions


def test_ledger_entry_created(monkeypatch, tmp_path):
    monkeypatch.setattr(ledger_mod, "_LEDGER_DIR", tmp_path)
    decision = RecommendationDecision(
        symbol="NVDA",
        action="trim",
        confidence=0.8,
        mode="assisted",
        rule_triggers=["take_profit"],
        requires_user_approval=True,
    )
    entry = append_decision(decision, source="assisted_ai")
    assert entry.symbol == "NVDA"
    rows = list_decisions(limit=10)
    assert len(rows) == 1
    assert rows[0].action == "trim"


def test_blocked_trade_visible_in_ledger(monkeypatch, tmp_path):
    monkeypatch.setattr(ledger_mod, "_LEDGER_DIR", tmp_path)
    decision = RecommendationDecision(
        symbol="CRM",
        action="watch",
        confidence=0.6,
        mode="autonomous",
        blocked_reason="insufficient_cash",
        executed=False,
    )
    entry = append_decision(decision, source="autonomous_ai")
    assert entry.blocked_reason == "insufficient_cash"
    assert entry.executed is False
