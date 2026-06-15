"""Persist and query decision ledger entries."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.schemas.decision_ledger import DecisionLedgerEntry
from app.schemas.recommendations import RecommendationDecision

_LEDGER_DIR = Path("artifacts/decision_ledger")


def _entry_path(entry_id: str) -> Path:
    return _LEDGER_DIR / f"{entry_id}.json"


def append_decision(
    decision: RecommendationDecision,
    *,
    source: str = "risk_engine",
    approved_by_user: bool | None = None,
) -> DecisionLedgerEntry:
    """Write one ledger entry from a recommendation decision."""
    _LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    entry_id = uuid.uuid4().hex
    entry = DecisionLedgerEntry(
        id=entry_id,
        created_at=datetime.now(timezone.utc),
        symbol=decision.symbol,
        action=decision.action,
        mode=decision.mode,
        source=source,  # type: ignore[arg-type]
        decision=decision.action,
        reason_codes=list(decision.reason_codes),
        rule_triggers=list(decision.rule_triggers),
        ai_summary=decision.ai_summary,
        approved_by_user=approved_by_user,
        executed=decision.executed,
        blocked_reason=decision.blocked_reason,
    )
    _entry_path(entry_id).write_text(
        entry.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return entry


def list_decisions(*, limit: int = 100) -> list[DecisionLedgerEntry]:
    """Return recent ledger entries newest first."""
    if not _LEDGER_DIR.exists():
        return []
    files = sorted(_LEDGER_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    entries: list[DecisionLedgerEntry] = []
    for path in files[:limit]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            entries.append(DecisionLedgerEntry.model_validate(payload))
        except (OSError, ValueError, ValidationError):
            continue
    return entries


def clear_decisions() -> int:
    """Delete all ledger entries. Returns the number of files removed."""
    if not _LEDGER_DIR.exists():
        return 0
    deleted = 0
    for path in _LEDGER_DIR.glob("*.json"):
        try:
            path.unlink()
            deleted += 1
        except OSError:
            continue
    return deleted


def append_decisions(decisions: list[RecommendationDecision], *, source: str) -> list[DecisionLedgerEntry]:
    """Append multiple decisions to the ledger."""
    return [append_decision(row, source=source) for row in decisions]
