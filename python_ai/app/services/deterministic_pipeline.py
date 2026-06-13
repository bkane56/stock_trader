"""Wire deterministic universe, scoring, risk, and decisions into briefings."""

from app.core.config import Settings
from app.pipeline.persistence import latest_persisted_morning_briefing
from app.schemas.recommendations import HoldingSnapshot, RecommendationDecision
from app.services.ai_budget_policy import can_run_research, record_research_run
from app.services.cache import recommendation_cache
from app.services.candidate_scoring import score_candidates
from app.services.candidate_universe import build_candidate_universe
from app.services.decision_ledger import append_decisions
from app.services.recommendation_decision import build_recommendation_decisions


def _recent_recommended_symbols() -> list[str]:
    """Extract symbols from the latest persisted briefing."""
    latest = latest_persisted_morning_briefing()
    if latest is None:
        return []
    symbols: list[str] = []
    for row in latest.decision_trace:
        symbols.append(row.symbol)
    for row in latest.holdings_actions:
        symbols.append(row.symbol)
    for row in latest.cash_deployment_options:
        symbols.append(row.symbol)
    return symbols


def _execution_mode(trading_mode: str) -> str:
    return {
        "manual_user": "manual",
        "assisted_agent": "assisted",
        "autonomous_agent": "autonomous",
    }.get(str(trading_mode).strip(), "manual")


def _cache_key(
    holdings: list[str],
    cash_available: float,
    trading_mode: str,
) -> str:
    return f"{','.join(sorted(holdings))}::{cash_available:.2f}::{trading_mode}"


def run_deterministic_preflight(
    *,
    holdings: list[str],
    holdings_snapshot: list[HoldingSnapshot],
    cash_available: float,
    trading_mode: str,
    settings: Settings,
    force_refresh: bool = False,
) -> tuple[list[str], list, list[RecommendationDecision], bool]:
    """Build universe, scores, and decisions; return cache_hit flag."""
    cache = recommendation_cache(settings.RECOMMENDATION_CACHE_TTL_SEC)
    key = _cache_key(holdings, cash_available, trading_mode)
    if settings.USE_CACHED_RESEARCH_IF_FRESH and not force_refresh:
        cached = cache.get(key)
        if cached is not None:
            universe, scores, decisions, _ = cached
            return universe, scores, decisions, True

    universe = build_candidate_universe(
        holdings=holdings,
        recently_recommended=_recent_recommended_symbols(),
        settings=settings,
    )
    scores = score_candidates(
        universe,
        holdings_snapshot=holdings_snapshot,
        cash_available=cash_available,
        settings=settings,
    )
    mode = _execution_mode(trading_mode)
    decisions = build_recommendation_decisions(
        scored_candidates=scores,
        holdings_snapshot=holdings_snapshot,
        cash_available=cash_available,
        mode=mode,  # type: ignore[arg-type]
        settings=settings,
    )
    result = (universe, scores, decisions, False)
    cache.set(key, result)
    return result


def record_decisions_to_ledger(
    decisions: list[RecommendationDecision],
    *,
    trading_mode: str,
) -> None:
    """Persist decision trace entries for audit."""
    source = "assisted_ai" if trading_mode == "assisted_agent" else "autonomous_ai"
    if trading_mode == "manual_user":
        source = "risk_engine"
    append_decisions(decisions, source=source)


def gate_research_run(*, force_refresh: bool = False, settings: Settings) -> tuple[bool, str | None]:
    """Check AI budget before triggering LLM research."""
    if not settings.USE_DETERMINISTIC_PIPELINE:
        return True, None
    from app.services.ai_budget_policy import record_research_run_if_allowed

    return record_research_run_if_allowed(force_refresh=force_refresh, settings=settings)
