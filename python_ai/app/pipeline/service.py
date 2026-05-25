"""Backward-compatibility shim — import from orchestrator, briefing_logic, or persistence instead."""

# ruff: noqa: F401
from app.pipeline.orchestrator import (
    generate_and_persist_morning_briefing,
    generate_initial_recommendations,
    generate_market_research,
    generate_morning_briefing,
    latest_mcp_runtime_debug,
    latest_pipeline_run_summary,
    latest_recommendation_tools_used,
    runtime_health_details,
)
from app.pipeline.persistence import (
    latest_persisted_morning_briefing,
    persist_morning_briefing,
)
