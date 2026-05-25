"""Artifact read/write for pipeline outputs (morning briefings, etc.)."""

import json
import logging
from pathlib import Path

from pydantic import ValidationError

from app.schemas.recommendations import MorningBriefingResponse

logger = logging.getLogger(__name__)

_ARTIFACTS_DIR = Path("artifacts")
_MORNING_BRIEFING_FILE_GLOB = "morning_briefing_*.json"


def persist_morning_briefing(briefing: MorningBriefingResponse) -> str:
    """Write a morning briefing to disk and return the file path."""
    _ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = briefing.generated_at.strftime("%Y%m%d%H%M%S")
    path = _ARTIFACTS_DIR / f"morning_briefing_{run_id}.json"
    path.write_text(
        json.dumps(briefing.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return str(path)


def latest_persisted_morning_briefing() -> MorningBriefingResponse | None:
    """Return the most recent persisted morning briefing, or None if none exists."""
    files = sorted(_ARTIFACTS_DIR.glob(_MORNING_BRIEFING_FILE_GLOB))
    if not files:
        return None
    try:
        payload = json.loads(files[-1].read_text(encoding="utf-8"))
        return MorningBriefingResponse.model_validate(payload)
    except (OSError, ValueError, ValidationError):
        return None
