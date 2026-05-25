"""Thin public API for the pipeline: generate_morning_briefing, generate_market_research, etc."""

import asyncio
import logging
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.openai_agents_runtime import OpenAIAgentsRuntime
from app.agents.research_agent import ResearchAgent
from app.core.config import get_settings
from app.pipeline.briefing_logic import (
    build_cash_deployment_options,
    build_execution_recommendations,
    build_risk_flags,
    build_sell_only_execution_recommendations,
    clamp_strategy_growth,
    default_morning_focus,
    map_research_stance_to_action,
    normalize_symbols,
    should_suppress_new_buys,
)
from app.pipeline.persistence import persist_morning_briefing
from app.pipeline.recommendation_runner import (
    run_openai_agents_recommendations,
    run_openai_agents_research,
)
from app.schemas.recommendations import (
    ExecutionRecommendation,
    HoldingAction,
    HoldingResearch,
    HoldingSnapshot,
    MarketResearchResponse,
    MorningBriefingResponse,
    Recommendation,
)

logger = logging.getLogger(__name__)

_RUNTIME_STATUS_LOCK = Lock()
_RUNTIME_STATUS: dict[str, str] = {
    "status": "ok",
    "mode": "not_started",
    "reason": "No recommendation request has run yet.",
    "provider": "",
    "model": "",
    "last_updated": "",
}
_LAST_RECOMMENDATION_TOOLS_USED: list[str] = []
_LAST_MCP_RUNTIME_DEBUG: dict[str, Any] = {}


def _set_runtime_status(*, mode: str, reason: str, provider: str, model: str) -> None:
    with _RUNTIME_STATUS_LOCK:
        _RUNTIME_STATUS.update(
            {
                "status": "ok",
                "mode": mode,
                "reason": reason,
                "provider": provider,
                "model": model,
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }
        )


def _set_last_recommendation_tools_used(tool_names: list[str]) -> None:
    with _RUNTIME_STATUS_LOCK:
        global _LAST_RECOMMENDATION_TOOLS_USED
        _LAST_RECOMMENDATION_TOOLS_USED = list(tool_names)


def latest_recommendation_tools_used() -> list[str]:
    """Return the tools used in the most recent recommendation run."""
    with _RUNTIME_STATUS_LOCK:
        return list(_LAST_RECOMMENDATION_TOOLS_USED)


def _set_last_mcp_runtime_debug(payload: dict[str, Any]) -> None:
    with _RUNTIME_STATUS_LOCK:
        global _LAST_MCP_RUNTIME_DEBUG
        _LAST_MCP_RUNTIME_DEBUG = dict(payload)


def latest_mcp_runtime_debug() -> dict[str, Any]:
    """Return the most recent MCP runtime debug snapshot."""
    with _RUNTIME_STATUS_LOCK:
        return dict(_LAST_MCP_RUNTIME_DEBUG)


def _set_last_mcp_runtime_error(
    *,
    mode: str,
    phase: str,
    configured: dict[str, Any],
    exc: Exception,
    connected: dict[str, Any] | None = None,
) -> None:
    _set_last_mcp_runtime_debug(
        {
            "mode": mode,
            "phase": phase,
            "configured": configured,
            "last_connected": connected or {},
            "last_error": str(exc),
            "last_error_type": exc.__class__.__name__,
        }
    )


def _scaffold_recommendations(
    symbols: list[str], advisor_agent: FinancialAdvisorAgent
) -> list[Recommendation]:
    now = datetime.now(timezone.utc)
    rationale_prefix = advisor_agent.rationale_prefix()
    return [
        Recommendation(
            symbol=symbol.upper(),
            action="hold",
            confidence=0.25,
            rationale=(
                f"{rationale_prefix}. Initial scaffold recommendation while "
                "AI signals are being built."
            ),
            generated_at=now,
        )
        for symbol in symbols
    ]


def generate_initial_recommendations(
    symbols: list[str],
    *,
    autonomous_mode: bool = False,
) -> list[Recommendation]:
    """Run the advisor agent and return per-symbol recommendations."""
    settings = get_settings()
    research_agent = ResearchAgent(settings=settings, autonomous_mode=autonomous_mode)
    advisor_agent = FinancialAdvisorAgent(
        settings=settings,
        delegated_tool_provider=research_agent,
        autonomous_mode=autonomous_mode,
    )
    normalized_symbols = normalize_symbols(symbols)
    if not normalized_symbols:
        logger.info("Recommendation request received with no valid symbols.")
        _set_runtime_status(
            mode="fallback",
            reason="No valid symbols were provided.",
            provider=advisor_agent.identity.provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return []

    provider = advisor_agent.identity.provider
    api_key = settings.resolved_ai_api_key()
    require_research_context = bool(settings.SERPER_API_KEY.strip())
    logger.info(
        "Recommendation request provider=%s model=%s symbols=%s",
        provider,
        advisor_agent.identity.model,
        ",".join(normalized_symbols),
    )

    if provider != "openai":
        logger.warning(
            "Falling back to scaffold recommendations: unsupported provider '%s'.",
            provider,
        )
        _set_runtime_status(
            mode="fallback",
            reason=f"Unsupported AI provider '{provider}'.",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return _scaffold_recommendations(normalized_symbols, advisor_agent)

    if not api_key:
        logger.warning("Falling back to scaffold recommendations: OPENAI_API_KEY missing.")
        _set_runtime_status(
            mode="fallback",
            reason="OPENAI_API_KEY is missing.",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return _scaffold_recommendations(normalized_symbols, advisor_agent)

    try:
        recommendations, tools_used = run_openai_agents_recommendations(
            settings=settings,
            symbols=normalized_symbols,
            require_research_context=require_research_context,
            autonomous_mode=autonomous_mode,
            set_mcp_debug_fn=_set_last_mcp_runtime_debug,
        )
        logger.info(
            "Live OpenAI recommendation run succeeded with %d recommendation(s).",
            len(recommendations),
        )
        _set_runtime_status(
            mode="live_openai",
            reason="Live OpenAI recommendation run succeeded.",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used(tools_used)
        return recommendations
    except asyncio.CancelledError as exc:
        logger.exception("Live OpenAI recommendation run cancelled. Falling back to scaffold.")
        runtime = OpenAIAgentsRuntime(settings=settings)
        _set_last_mcp_runtime_error(
            mode="recommendations",
            phase="failed",
            configured=runtime.debug_snapshot(),
            exc=exc,
        )
        _set_runtime_status(
            mode="fallback",
            reason=f"Live OpenAI run cancelled: {exc}",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return _scaffold_recommendations(normalized_symbols, advisor_agent)
    except Exception as exc:
        logger.exception("Live OpenAI recommendation run failed. Falling back to scaffold.")
        runtime = OpenAIAgentsRuntime(settings=settings)
        _set_last_mcp_runtime_error(
            mode="recommendations",
            phase="failed",
            configured=runtime.debug_snapshot(),
            exc=exc,
        )
        _set_runtime_status(
            mode="fallback",
            reason=f"Live OpenAI run failed: {exc}",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return _scaffold_recommendations(normalized_symbols, advisor_agent)


def generate_market_research(
    holdings: list[str],
    focus: str = "",
    strategy_growth_pct: float = 60.0,
    strategy_fixed_pct: float = 40.0,
    *,
    autonomous_mode: bool = False,
) -> MarketResearchResponse:
    """Run the research agent and return a MarketResearchResponse."""
    settings = get_settings()
    research_agent = ResearchAgent(settings=settings, autonomous_mode=autonomous_mode)
    normalized_holdings = normalize_symbols(holdings)
    min_buy_confidence = settings.resolved_research_min_buy_confidence()
    provider = research_agent.identity.provider
    api_key = settings.resolved_ai_api_key()
    require_web_search = bool(settings.SERPER_API_KEY.strip())
    logger.info(
        (
            "Research request provider=%s model=%s holdings=%s focus=%s "
            "min_buy_confidence=%.2f strategy_growth_pct=%.1f strategy_fixed_pct=%.1f"
        ),
        provider,
        research_agent.identity.model,
        ",".join(normalized_holdings),
        focus.strip() or "<none>",
        min_buy_confidence,
        clamp_strategy_growth(strategy_growth_pct),
        max(0.0, min(100.0, float(strategy_fixed_pct))),
    )

    if provider != "openai":
        logger.warning(
            "Falling back to scaffold research response: unsupported provider '%s'.",
            provider,
        )
        return MarketResearchResponse(
            holdings_review=[
                HoldingResearch(
                    symbol=symbol,
                    stance="watch",
                    confidence=0.2,
                    reason="Unsupported provider in current runtime.",
                )
                for symbol in normalized_holdings
            ],
            sector_outlook=[],
            stock_ideas=[],
            top_3_buys=[],
            do_not_buy=[],
            macro_summary="Live research unavailable because provider is not openai.",
        )

    if not api_key:
        logger.warning("Falling back to scaffold research response: OPENAI_API_KEY missing.")
        return MarketResearchResponse(
            holdings_review=[
                HoldingResearch(
                    symbol=symbol,
                    stance="watch",
                    confidence=0.2,
                    reason="OPENAI_API_KEY is missing; live research did not run.",
                )
                for symbol in normalized_holdings
            ],
            sector_outlook=[],
            stock_ideas=[],
            top_3_buys=[],
            do_not_buy=[],
            macro_summary="Live research unavailable because OPENAI_API_KEY is missing.",
        )

    try:
        return run_openai_agents_research(
            settings=settings,
            holdings=normalized_holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            strategy_growth_pct=clamp_strategy_growth(strategy_growth_pct),
            strategy_fixed_pct=max(0.0, min(100.0, float(strategy_fixed_pct))),
            require_web_search=require_web_search,
            autonomous_mode=autonomous_mode,
            set_mcp_debug_fn=_set_last_mcp_runtime_debug,
        )
    except asyncio.CancelledError as exc:
        logger.exception(
            "Live OpenAI market research run cancelled. Returning fallback payload."
        )
        runtime = OpenAIAgentsRuntime(settings=settings)
        _set_last_mcp_runtime_error(
            mode="research",
            phase="failed",
            configured=runtime.debug_snapshot(),
            exc=exc,
        )
        return MarketResearchResponse(
            holdings_review=[
                HoldingResearch(
                    symbol=symbol,
                    stance="watch",
                    confidence=0.2,
                    reason=f"Live research run cancelled: {exc}",
                )
                for symbol in normalized_holdings
            ],
            sector_outlook=[],
            stock_ideas=[],
            top_3_buys=[],
            do_not_buy=[],
            macro_summary="Live research cancelled; review logs and retry.",
        )
    except Exception as exc:
        logger.exception("Live OpenAI market research run failed. Returning fallback payload.")
        runtime = OpenAIAgentsRuntime(settings=settings)
        _set_last_mcp_runtime_error(
            mode="research",
            phase="failed",
            configured=runtime.debug_snapshot(),
            exc=exc,
        )
        return MarketResearchResponse(
            holdings_review=[
                HoldingResearch(
                    symbol=symbol,
                    stance="watch",
                    confidence=0.2,
                    reason=f"Live research run failed: {exc}",
                )
                for symbol in normalized_holdings
            ],
            sector_outlook=[],
            stock_ideas=[],
            top_3_buys=[],
            do_not_buy=[],
            macro_summary="Live research failed; review logs and retry.",
        )


def generate_morning_briefing(
    *,
    holdings: list[str],
    holdings_snapshot: list[HoldingSnapshot] | None = None,
    cash_available: float,
    strategy_growth_pct: float = 60.0,
    strategy_fixed_pct: float = 40.0,
    focus: str = "",
    trading_mode: str = "manual_user",
) -> MorningBriefingResponse:
    """Generate a full morning briefing combining research and portfolio execution plan."""
    settings = get_settings()
    normalized_holdings = normalize_symbols(holdings)
    autonomous_mode = str(trading_mode).strip() == "autonomous_agent"
    research_focus = default_morning_focus(focus)
    clamped_growth_pct = clamp_strategy_growth(strategy_growth_pct)
    clamped_fixed_pct = max(0.0, min(100.0, float(strategy_fixed_pct)))
    research = generate_market_research(
        holdings=normalized_holdings,
        focus=research_focus,
        strategy_growth_pct=clamped_growth_pct,
        strategy_fixed_pct=clamped_fixed_pct,
        autonomous_mode=autonomous_mode,
    )

    holdings_actions = [
        HoldingAction(
            symbol=row.symbol,
            action=map_research_stance_to_action(row.stance),
            confidence=row.confidence,
            reason=row.reason,
        )
        for row in research.holdings_review
    ]

    safe_cash_available = max(0.0, float(cash_available))
    holdings_snapshot_value = sum(
        max(0.0, float(row.shares)) * max(0.0, float(row.price))
        for row in (holdings_snapshot or [])
    )
    total_portfolio_value = safe_cash_available + holdings_snapshot_value
    reserve_ratio = settings.resolved_morning_briefing_cash_reserve_ratio()
    reserve_cash_target = round(total_portfolio_value * reserve_ratio, 2)
    deployable_cash_budget = round(max(0.0, safe_cash_available - reserve_cash_target), 2)
    min_cash_to_deploy = max(0.0, float(settings.MORNING_BRIEFING_MIN_CASH))
    can_deploy = deployable_cash_budget >= min_cash_to_deploy
    new_buys_deferred = should_suppress_new_buys(holdings_actions, holdings_snapshot or [])
    known_names_by_symbol = {
        row.symbol.upper(): row.name.strip()
        for row in (holdings_snapshot or [])
        if row.symbol and row.name and row.name.strip()
    }
    buy_candidates = []
    if not new_buys_deferred:
        buy_candidates = research.top_3_buys if can_deploy else []
    cash_deployment_options = build_cash_deployment_options(
        candidates=buy_candidates,
        deployable_cash_budget=deployable_cash_budget,
        strategy_growth_pct=clamped_growth_pct,
        known_names_by_symbol=known_names_by_symbol,
    )
    if (
        not cash_deployment_options
        and not new_buys_deferred
        and research.top_3_buys
        and (holdings_snapshot or [])
    ):
        rotation_target_budget = max(min_cash_to_deploy, 0.0)
        cash_deployment_options = build_cash_deployment_options(
            candidates=research.top_3_buys,
            deployable_cash_budget=rotation_target_budget,
            strategy_growth_pct=clamped_growth_pct,
            known_names_by_symbol=known_names_by_symbol,
        )

    sell_only_rows: list[ExecutionRecommendation] = []
    if not cash_deployment_options:
        sell_only_rows = build_sell_only_execution_recommendations(
            holdings_actions=holdings_actions,
            holdings_snapshot=holdings_snapshot or [],
        )
    rotation_excluded = {
        str(row.sell_leg.symbol).upper()
        for row in sell_only_rows
        if row.sell_leg is not None
    }
    buy_execution_rows = build_execution_recommendations(
        holdings_actions=holdings_actions,
        cash_deployment_options=cash_deployment_options,
        holdings_snapshot=holdings_snapshot or [],
        deployable_cash_budget=deployable_cash_budget,
        exclude_rotation_symbols=rotation_excluded,
    )
    execution_recommendations = [*sell_only_rows, *buy_execution_rows]

    execution_mode = {
        "manual_user": "manual",
        "assisted_agent": "assisted",
        "autonomous_agent": "autonomous",
    }.get(str(trading_mode).strip(), "manual")

    return MorningBriefingResponse(
        execution_mode=execution_mode,
        new_buys_deferred=new_buys_deferred,
        holdings_actions=holdings_actions,
        cash_deployment_options=cash_deployment_options,
        cash_available=safe_cash_available,
        reserve_ratio=reserve_ratio,
        reserve_cash_target=reserve_cash_target,
        deployable_cash_budget=deployable_cash_budget,
        execution_recommendations=execution_recommendations,
        macro_news_summary=research.macro_summary,
        risk_flags=build_risk_flags(research),
        generated_at=research.generated_at,
    )


def generate_and_persist_morning_briefing(
    *,
    holdings: list[str],
    holdings_snapshot: list[HoldingSnapshot] | None = None,
    cash_available: float,
    strategy_growth_pct: float = 60.0,
    strategy_fixed_pct: float = 40.0,
    focus: str = "",
    trading_mode: str = "manual_user",
) -> MorningBriefingResponse:
    """Generate and persist a morning briefing in one call."""
    briefing = generate_morning_briefing(
        holdings=holdings,
        holdings_snapshot=holdings_snapshot,
        cash_available=cash_available,
        strategy_growth_pct=strategy_growth_pct,
        strategy_fixed_pct=strategy_fixed_pct,
        focus=focus,
        trading_mode=trading_mode,
    )
    persist_morning_briefing(briefing)
    return briefing


def latest_pipeline_run_summary() -> dict[str, str | int]:
    """Return a summary of the last pipeline run for health checks."""
    return {
        "status": "ok",
        "last_run": datetime.now(timezone.utc).isoformat(),
        "documents_processed": 0,
    }


def runtime_health_details() -> dict[str, Any]:
    """Return a detailed health snapshot of the runtime configuration."""
    settings = get_settings()
    runtime = OpenAIAgentsRuntime(settings=settings)
    research_agent = ResearchAgent(settings=settings)
    advisor_agent = FinancialAdvisorAgent(
        settings=settings,
        delegated_tool_provider=research_agent,
    )
    advisor_tool_names = sorted(
        {
            str(tool.get("name", "")).strip()
            for tool in advisor_agent.tool_schemas()
            if str(tool.get("name", "")).strip()
        }
    )
    with _RUNTIME_STATUS_LOCK:
        details = dict(_RUNTIME_STATUS)
    details["configured_provider"] = settings.resolved_ai_provider()
    details["configured_model"] = settings.resolved_ai_model()
    details["openai_api_key_configured"] = "yes" if bool(settings.OPENAI_API_KEY.strip()) else "no"
    details["serper_api_key_configured"] = "yes" if bool(settings.SERPER_API_KEY.strip()) else "no"
    details["research_min_buy_confidence"] = settings.resolved_research_min_buy_confidence()
    details["morning_briefing_cash_reserve_ratio"] = (
        settings.resolved_morning_briefing_cash_reserve_ratio()
    )
    details["configured_advisor_tools"] = advisor_tool_names
    details["mcp_runtime_configured"] = runtime.debug_snapshot()
    details["mcp_runtime_last_run"] = latest_mcp_runtime_debug()
    details["last_recommendation_tools_used"] = latest_recommendation_tools_used()
    return details
