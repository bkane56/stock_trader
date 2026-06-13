"""AI research budget policy: rate limits and daily caps."""

import json
from datetime import date, datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings

_ARTIFACTS_DIR = Path("artifacts")
_BUDGET_STATE_FILE = _ARTIFACTS_DIR / "ai_budget_state.json"


class AiBudgetPolicy(BaseModel):
    """Configurable limits on AI research runs."""

    max_research_runs_per_day: int = 6
    min_minutes_between_research_runs: int = 60
    max_symbols_per_research_run: int = 12
    max_llm_calls_per_run: int = 2
    use_cached_research_if_fresh: bool = True


class AiBudgetState(BaseModel):
    """Persisted run counters for budget enforcement."""

    day: str = Field(default_factory=lambda: date.today().isoformat())
    runs_today: int = 0
    last_run_at: datetime | None = None


def policy_from_settings(settings: Settings | None = None) -> AiBudgetPolicy:
    """Build policy model from application settings."""
    cfg = settings or get_settings()
    return AiBudgetPolicy(
        max_research_runs_per_day=int(cfg.MAX_RESEARCH_RUNS_PER_DAY),
        min_minutes_between_research_runs=int(cfg.MIN_MINUTES_BETWEEN_RESEARCH_RUNS),
        max_symbols_per_research_run=int(cfg.MAX_SYMBOLS_PER_RESEARCH_RUN),
        max_llm_calls_per_run=int(cfg.MAX_LLM_CALLS_PER_RUN),
        use_cached_research_if_fresh=bool(cfg.USE_CACHED_RESEARCH_IF_FRESH),
    )


def _load_state() -> AiBudgetState:
    if not _BUDGET_STATE_FILE.exists():
        return AiBudgetState()
    try:
        payload = json.loads(_BUDGET_STATE_FILE.read_text(encoding="utf-8"))
        state = AiBudgetState.model_validate(payload)
    except (OSError, ValueError):
        return AiBudgetState()
    if state.day != date.today().isoformat():
        return AiBudgetState()
    return state


def _save_state(state: AiBudgetState) -> None:
    _ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    _BUDGET_STATE_FILE.write_text(
        state.model_dump_json(indent=2),
        encoding="utf-8",
    )


def can_run_research(
    *,
    force_refresh: bool = False,
    settings: Settings | None = None,
) -> tuple[bool, str | None]:
    """Return whether a new research run is allowed and optional block reason."""
    cfg = settings or get_settings()
    policy = policy_from_settings(cfg)
    state = _load_state()

    if state.runs_today >= policy.max_research_runs_per_day and not force_refresh:
        return False, "max_research_runs_per_day"

    if state.last_run_at and not force_refresh:
        elapsed_min = (
            datetime.now(timezone.utc) - state.last_run_at
        ).total_seconds() / 60.0
        if elapsed_min < policy.min_minutes_between_research_runs:
            return False, "min_interval_not_elapsed"

    return True, None


def record_research_run_if_allowed(
    *,
    force_refresh: bool = False,
    settings: Settings | None = None,
) -> tuple[bool, str | None]:
    """Check budget and record a run when allowed."""
    allowed, reason = can_run_research(force_refresh=force_refresh, settings=settings)
    if allowed:
        record_research_run()
    return allowed, reason


def record_research_run() -> AiBudgetState:
    """Increment daily counter and persist last run timestamp."""
    state = _load_state()
    if state.day != date.today().isoformat():
        state = AiBudgetState()
    state.runs_today += 1
    state.last_run_at = datetime.now(timezone.utc)
    _save_state(state)
    return state
