"""Tests for pipeline.persistence — artifact read/write."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.pipeline import persistence
from app.pipeline.persistence import latest_persisted_morning_briefing, persist_morning_briefing
from app.schemas.recommendations import MorningBriefingResponse


def _minimal_briefing(ts: datetime | None = None) -> MorningBriefingResponse:
    """Return a MorningBriefingResponse with all required fields populated."""
    generated_at = ts or datetime(2026, 1, 15, 9, 30, 0, tzinfo=timezone.utc)
    return MorningBriefingResponse(
        holdings_actions=[],
        cash_deployment_options=[],
        cash_available=10_000.0,
        macro_news_summary="test summary",
        risk_flags=[],
        generated_at=generated_at,
    )


def test_persist_and_reload_roundtrip(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr(persistence, "_ARTIFACTS_DIR", tmp_path)
    briefing = _minimal_briefing()

    file_path = persist_morning_briefing(briefing)

    assert Path(file_path).exists()
    assert "morning_briefing_" in file_path

    loaded = latest_persisted_morning_briefing()
    assert loaded is not None
    assert loaded.macro_news_summary == "test summary"
    assert loaded.cash_available == 10_000.0


def test_latest_returns_none_when_no_files(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr(persistence, "_ARTIFACTS_DIR", tmp_path)
    assert latest_persisted_morning_briefing() is None


def test_latest_returns_newest_when_multiple_files(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr(persistence, "_ARTIFACTS_DIR", tmp_path)

    old_briefing = _minimal_briefing(datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc))
    new_briefing = _minimal_briefing(datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc))

    persist_morning_briefing(old_briefing)
    persist_morning_briefing(new_briefing)

    loaded = latest_persisted_morning_briefing()
    assert loaded is not None
    assert loaded.generated_at == new_briefing.generated_at


def test_latest_returns_none_on_corrupt_file(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr(persistence, "_ARTIFACTS_DIR", tmp_path)
    corrupt_file = tmp_path / "morning_briefing_20260115093000.json"
    corrupt_file.write_text("not valid json", encoding="utf-8")

    assert latest_persisted_morning_briefing() is None


def test_persist_creates_directory_if_missing(tmp_path: Path, monkeypatch: Any) -> None:
    nested = tmp_path / "nested" / "artifacts"
    monkeypatch.setattr(persistence, "_ARTIFACTS_DIR", nested)
    briefing = _minimal_briefing()

    persist_morning_briefing(briefing)
    assert nested.exists()
