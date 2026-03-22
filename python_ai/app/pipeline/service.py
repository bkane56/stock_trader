import asyncio
import json
import logging
from pathlib import Path
from threading import Lock
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from app.agents.openai_agents_runtime import OpenAIAgentsRuntime
from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.prompts import (
    DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT,
    DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT,
)
from app.agents.research_agent import ResearchAgent
from app.core.config import get_settings
from app.schemas.recommendations import (
    CashDeploymentOption,
    DoNotBuyIdea,
    ExecutionRecommendation,
    HoldingResearch,
    HoldingAction,
    HoldingSnapshot,
    MarketResearchResponse,
    MorningBriefingResponse,
    Recommendation,
    RiskFlag,
    SectorResearch,
    SellLeg,
    StockIdea,
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
_ARTIFACTS_DIR = Path("artifacts")
_MORNING_BRIEFING_FILE_GLOB = "morning_briefing_*.json"


def _set_runtime_status(
    *,
    mode: str,
    reason: str,
    provider: str,
    model: str,
) -> None:
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
    with _RUNTIME_STATUS_LOCK:
        return list(_LAST_RECOMMENDATION_TOOLS_USED)


def _set_last_mcp_runtime_debug(payload: dict[str, Any]) -> None:
    with _RUNTIME_STATUS_LOCK:
        global _LAST_MCP_RUNTIME_DEBUG
        _LAST_MCP_RUNTIME_DEBUG = dict(payload)


def latest_mcp_runtime_debug() -> dict[str, Any]:
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


def _normalize_symbols(symbols: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in symbols:
        symbol = raw.strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        normalized.append(symbol)
    return normalized


def _map_research_stance_to_action(stance: str) -> str:
    mapping = {
        "exit": "sell",
        "trim": "trim",
        "hold": "hold",
        "add": "add",
        "watch": "watch",
    }
    normalized = stance.strip().lower()
    return mapping.get(normalized, "watch")


def _default_morning_focus(raw_focus: str) -> str:
    trimmed = raw_focus.strip()
    if trimmed:
        return trimmed
    return "general stock market news, macroeconomy, and world news"


def _clamp_strategy_growth(strategy_growth_pct: float) -> float:
    return max(0.0, min(100.0, float(strategy_growth_pct)))


def _strategy_context_text(strategy_growth_pct: float, strategy_fixed_pct: float) -> str:
    growth = round(_clamp_strategy_growth(strategy_growth_pct), 1)
    fixed_income = round(max(0.0, min(100.0, float(strategy_fixed_pct))), 1)
    if growth <= 20:
        posture = "conservative"
    elif growth <= 40:
        posture = "moderate-conservative"
    elif growth <= 60:
        posture = "moderate"
    elif growth <= 80:
        posture = "moderate-aggressive"
    else:
        posture = "aggressive"
    return (
        f"Portfolio strategy target: {growth:.1f}% growth / {fixed_income:.1f}% fixed income "
        f"({posture} risk posture)."
    )


def _build_risk_flags(
    research: MarketResearchResponse,
) -> list[RiskFlag]:
    flags: list[RiskFlag] = []
    severe_do_not_buy = sorted(
        [row for row in research.do_not_buy if row.confidence >= 0.65],
        key=lambda row: row.confidence,
        reverse=True,
    )[:3]
    for row in severe_do_not_buy:
        flags.append(
            RiskFlag(
                category="symbol",
                severity="high" if row.confidence >= 0.8 else "medium",
                summary=f"{row.symbol}: {row.reason}",
            )
        )

    macro_text = research.macro_summary.lower()
    macro_keywords = (
        "inflation",
        "recession",
        "geopolitical",
        "war",
        "tariff",
        "volatility",
        "liquidity",
        "credit",
    )
    if any(keyword in macro_text for keyword in macro_keywords):
        flags.append(
            RiskFlag(
                category="macro",
                severity="medium",
                summary="Macro conditions include elevated uncertainty; size positions conservatively.",
            )
        )

    if not flags:
        flags.append(
            RiskFlag(
                category="macro",
                severity="low",
                summary="No elevated systemic risk signal detected in current briefing.",
            )
        )
    return flags


def _run_async(coro: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Sync pipeline methods are expected to run outside active event loops.
    raise RuntimeError(
        "OpenAI Agents SDK execution requires sync context without a running event loop."
    )


def _build_user_prompt(symbols: list[str]) -> str:
    return (
        "Create one recommendation per ticker using only provided context and any "
        "MCP tools you call.\n"
        "Before final recommendations, gather market context for each ticker "
        "from available MCP market-data tools.\n"
        "Call the `Researcher` tool once for cross-market context, then use that "
        "output to refine per-ticker recommendations.\n"
        f"Tickers: {', '.join(symbols)}\n"
        "Return STRICT JSON with this shape and no markdown:\n"
        '{"recommendations":[{"symbol":"SPY","action":"buy|sell|hold|consider",'
        '"confidence":0.0,"rationale":"..."}]}'
    )


def _extract_recommendations_from_model_output(
    model_output: str,
    symbols: list[str],
    generated_at: datetime,
) -> list[Recommendation]:
    payload = json.loads(model_output)
    records = payload.get("recommendations")
    if not isinstance(records, list):
        raise ValueError("Model output missing 'recommendations' list")

    allowed = set(symbols)
    parsed: list[Recommendation] = []
    for item in records:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol", "")).strip().upper()
        if symbol not in allowed:
            continue

        recommendation = Recommendation(
            symbol=symbol,
            action=str(item.get("action", "hold")).strip().lower(),
            confidence=float(item.get("confidence", 0.0)),
            rationale=str(item.get("rationale", "")).strip()
            or "No rationale returned by model.",
            generated_at=generated_at,
        )
        parsed.append(recommendation)

    parsed_by_symbol = {rec.symbol: rec for rec in parsed}
    return [
        parsed_by_symbol.get(
            symbol,
            Recommendation(
                symbol=symbol,
                action="hold",
                confidence=0.2,
                rationale=(
                    "Model did not return a recommendation for this symbol; defaulted "
                    "to hold."
                ),
                generated_at=generated_at,
            ),
        )
        for symbol in symbols
    ]


def _build_research_user_prompt(
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    strategy_growth_pct: float,
    strategy_fixed_pct: float,
) -> str:
    holdings_text = ", ".join(holdings) if holdings else "(none)"
    focus_text = focus.strip() or "broad market opportunities"
    return (
        "Build a practical market research brief for an active trader.\n"
        "Before finalizing, gather internet evidence and market context with MCP tools.\n"
        "Start with broad market and world-news context using "
        "`get_general_market_news_digest` once.\n"
        "Run multiple searches and compare sources before concluding.\n"
        "Cover all of the following evidence areas before deciding: "
        "macro regime, sector momentum/rotation, and company-specific catalysts.\n"
        "For each current holding, include at least one stock-specific evidence point.\n"
        "For top_3_buys, prioritize symbols that are not already in current holdings. "
        "Only include an existing holding if no non-holding idea meets the minimum "
        "confidence threshold.\n"
        f"Minimum confidence for top_3_buys is {min_buy_confidence:.2f}.\n"
        f"{_strategy_context_text(strategy_growth_pct, strategy_fixed_pct)}\n"
        "Adjust recommendations to respect this strategy tilt and avoid over-concentrating "
        "new cash deployment into a single symbol when alternatives are similarly compelling.\n"
        f"Current holdings: {holdings_text}\n"
        f"Research focus: {focus_text}\n"
        "Return STRICT JSON with this exact top-level shape and no markdown:\n"
        "{"
        '"holdings_review":[{"symbol":"AAPL","stance":"add|hold|trim|exit|watch",'
        '"confidence":0.0,"reason":"..."}],'
        '"sector_outlook":[{"sector":"Technology","ticker":"XLK",'
        '"momentum":"strong|neutral|weak","summary":"..."}],'
        '"stock_ideas":[{"symbol":"NVDA","sector":"Technology","thesis":"...",'
        '"risk":"...","entry_style":"immediate|pullback|watchlist","confidence":0.0}],'
        '"top_3_buys":[{"symbol":"NVDA","sector":"Technology","thesis":"...",'
        '"risk":"...","entry_style":"pullback","confidence":0.0}],'
        '"do_not_buy":[{"symbol":"XYZ","sector":"Utilities","reason":"...",'
        '"confidence":0.0}],'
        '"macro_summary":"..."'
        "}"
    )


def _build_cash_deployment_options(
    *,
    candidates: list[StockIdea],
    deployable_cash_budget: float,
    strategy_growth_pct: float,
) -> list[CashDeploymentOption]:
    if deployable_cash_budget <= 0:
        return []
    if not candidates:
        return []

    safe_budget = round(max(0.0, float(deployable_cash_budget)), 2)
    if safe_budget <= 0:
        return []

    # Convert confidence scores into allocation weights with a tiny floor.
    weights = [max(0.01, float(row.confidence)) for row in candidates]
    total_weight = sum(weights)
    if total_weight <= 0:
        return []

    raw_allocations = [safe_budget * (weight / total_weight) for weight in weights]

    growth = _clamp_strategy_growth(strategy_growth_pct)
    if growth <= 20:
        max_single_allocation_pct = 0.40
    elif growth <= 40:
        max_single_allocation_pct = 0.50
    elif growth <= 60:
        max_single_allocation_pct = 0.60
    elif growth <= 80:
        max_single_allocation_pct = 0.70
    else:
        max_single_allocation_pct = 0.80
    max_single_allocation_amount = safe_budget * max_single_allocation_pct

    # Apply concentration cap only when there is a meaningful choice set.
    if len(raw_allocations) > 1:
        capped = [min(amount, max_single_allocation_amount) for amount in raw_allocations]
        remaining = safe_budget - sum(capped)
        if remaining > 0:
            while remaining > 1e-9:
                capacity_indices = [
                    idx
                    for idx, amount in enumerate(capped)
                    if amount < max_single_allocation_amount - 1e-9
                ]
                if not capacity_indices:
                    break
                total_capacity_weight = sum(weights[idx] for idx in capacity_indices)
                if total_capacity_weight <= 0:
                    break
                distributed = 0.0
                for idx in capacity_indices:
                    proportional = remaining * (weights[idx] / total_capacity_weight)
                    headroom = max_single_allocation_amount - capped[idx]
                    add_amount = min(headroom, proportional)
                    capped[idx] += add_amount
                    distributed += add_amount
                if distributed <= 1e-9:
                    break
                remaining -= distributed
        raw_allocations = capped
    allocations: list[float] = []
    running_total = 0.0
    for idx, amount in enumerate(raw_allocations):
        if idx == len(raw_allocations) - 1:
            final_amount = round(max(0.0, safe_budget - running_total), 2)
            allocations.append(final_amount)
            running_total += final_amount
            continue
        rounded_amount = round(max(0.0, amount), 2)
        allocations.append(rounded_amount)
        running_total += rounded_amount

    if allocations:
        delta = round(safe_budget - round(sum(allocations), 2), 2)
        if delta != 0:
            allocations[-1] = round(max(0.0, allocations[-1] + delta), 2)

    options: list[CashDeploymentOption] = []
    for row, amount in zip(candidates, allocations, strict=False):
        allocation_pct = (amount / safe_budget) if safe_budget > 0 else 0.0
        options.append(
            CashDeploymentOption(
                symbol=row.symbol,
                sector=row.sector,
                thesis=row.thesis,
                risk=row.risk,
                entry_style=row.entry_style,
                confidence=row.confidence,
                suggested_amount=amount,
                suggested_allocation_pct=round(allocation_pct, 4),
            )
        )
    return options


def _build_execution_recommendations(
    *,
    holdings_actions: list[HoldingAction],
    cash_deployment_options: list[CashDeploymentOption],
    holdings_snapshot: list[HoldingSnapshot],
    deployable_cash_budget: float,
) -> list[ExecutionRecommendation]:
    if not cash_deployment_options:
        return []

    holdings_by_symbol = {
        row.symbol.upper(): row
        for row in holdings_snapshot
        if row.symbol and row.shares > 0 and row.price > 0
    }
    action_by_symbol = {row.symbol.upper(): row for row in holdings_actions}

    sell_candidates: list[dict[str, Any]] = []
    for symbol, snapshot in holdings_by_symbol.items():
        action = action_by_symbol.get(symbol)
        if action is None:
            continue
        # Prioritize explicit sell/trim signals, then allow weaker names as backup
        # when cash deployment needs rotation funding.
        confidence = float(action.confidence)
        if action.action == "sell":
            priority = 0
            max_shares = snapshot.shares
        elif action.action == "trim":
            priority = 1
            max_shares = snapshot.shares * 0.5
        elif action.action == "watch" and confidence <= 0.55:
            priority = 2
            max_shares = snapshot.shares * 0.35
        elif action.action == "hold" and confidence <= 0.45:
            priority = 3
            max_shares = snapshot.shares * 0.25
        else:
            continue
        if max_shares <= 0:
            continue
        sell_candidates.append(
            {
                "symbol": symbol,
                "name": snapshot.name,
                "sector": snapshot.sector,
                "price": snapshot.price,
                "remaining_shares": max_shares,
                "action": action.action,
                "reason": action.reason,
                "confidence": confidence,
                "priority": priority,
            }
        )

    sell_candidates.sort(
        key=lambda row: (
            int(row["priority"]),
            -float(row["confidence"]),
            -float(row["remaining_shares"] * row["price"]),
        )
    )

    available_cash = max(0.0, float(deployable_cash_budget))
    execution_rows: list[ExecutionRecommendation] = []
    for buy in cash_deployment_options:
        buy_amount = max(0.0, float(buy.suggested_amount))
        if buy_amount <= 0:
            continue
        key = f"{buy.symbol}:{buy.entry_style}"
        sell_leg: SellLeg | None = None
        deficit = max(0.0, buy_amount - available_cash)
        if deficit > 0:
            for candidate in sell_candidates:
                candidate_price = float(candidate["price"])
                if candidate_price <= 0:
                    continue
                shares_needed = min(
                    float(candidate["remaining_shares"]),
                    deficit / candidate_price,
                )
                shares_needed = round(max(0.0, shares_needed), 4)
                if shares_needed <= 0:
                    continue
                candidate["remaining_shares"] = max(
                    0.0, float(candidate["remaining_shares"]) - shares_needed
                )
                proceeds = shares_needed * candidate_price
                available_cash += proceeds
                deficit = max(0.0, buy_amount - available_cash)
                sell_leg = SellLeg(
                    symbol=str(candidate["symbol"]),
                    shares=shares_needed,
                    estimated_price=candidate_price,
                    reason=str(candidate["reason"]) or "Fund strong-buy rotation.",
                )
                break
            # If this recommendation needs rotation but no sell leg is available,
            # skip it so UI only shows actionable sell-then-buy rows.
            if sell_leg is None:
                continue

        if available_cash <= 0:
            continue
        funded_amount = min(available_cash, buy_amount)
        if funded_amount <= 0:
            continue
        available_cash = max(0.0, available_cash - funded_amount)
        funded_buy = buy.model_copy(
            update={
                "suggested_amount": round(funded_amount, 2),
                "suggested_allocation_pct": 0.0,
            }
        )
        if sell_leg is not None:
            summary = (
                f"Sell {sell_leg.shares:.4f} shares of {sell_leg.symbol}, then buy "
                f"{funded_buy.symbol} with about ${funded_buy.suggested_amount:,.2f}."
            )
        else:
            summary = (
                f"Buy {funded_buy.symbol} with about ${funded_buy.suggested_amount:,.2f}."
            )
        execution_rows.append(
            ExecutionRecommendation(
                key=key,
                summary=summary,
                buy=funded_buy,
                sell_leg=sell_leg,
                requires_rotation=sell_leg is not None,
            )
        )
    return execution_rows


def _extract_market_research_from_model_output(
    model_output: str,
    holdings: list[str],
    min_buy_confidence: float,
    generated_at: datetime,
) -> MarketResearchResponse:
    payload = json.loads(model_output)

    raw_holdings = payload.get("holdings_review")
    raw_sectors = payload.get("sector_outlook")
    raw_ideas = payload.get("stock_ideas")
    raw_top_buys = payload.get("top_3_buys")
    raw_do_not_buy = payload.get("do_not_buy")
    raw_macro = str(payload.get("macro_summary", "")).strip()

    holdings_review: list[HoldingResearch] = []
    if isinstance(raw_holdings, list):
        for item in raw_holdings:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol", "")).strip().upper()
            if not symbol:
                continue
            holdings_review.append(
                HoldingResearch(
                    symbol=symbol,
                    stance=str(item.get("stance", "watch")).strip().lower(),
                    confidence=float(item.get("confidence", 0.0)),
                    reason=str(item.get("reason", "")).strip()
                    or "No holding rationale returned by model.",
                )
            )

    # Ensure every requested holding has at least one output row.
    by_symbol = {row.symbol: row for row in holdings_review}
    for symbol in holdings:
        if symbol not in by_symbol:
            holdings_review.append(
                HoldingResearch(
                    symbol=symbol,
                    stance="watch",
                    confidence=0.2,
                    reason="Model did not return this holding; defaulted to watch.",
                )
            )

    sector_outlook: list[SectorResearch] = []
    if isinstance(raw_sectors, list):
        for item in raw_sectors:
            if not isinstance(item, dict):
                continue
            sector = str(item.get("sector", "")).strip()
            ticker = str(item.get("ticker", "")).strip().upper()
            if not sector or not ticker:
                continue
            sector_outlook.append(
                SectorResearch(
                    sector=sector,
                    ticker=ticker,
                    momentum=str(item.get("momentum", "neutral")).strip().lower(),
                    summary=str(item.get("summary", "")).strip()
                    or "No sector summary returned by model.",
                )
            )

    stock_ideas: list[StockIdea] = []
    if isinstance(raw_ideas, list):
        for item in raw_ideas:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol", "")).strip().upper()
            sector = str(item.get("sector", "")).strip()
            if not symbol or not sector:
                continue
            stock_ideas.append(
                StockIdea(
                    symbol=symbol,
                    sector=sector,
                    thesis=str(item.get("thesis", "")).strip()
                    or "No thesis returned by model.",
                    risk=str(item.get("risk", "")).strip() or "Risk details not provided.",
                    entry_style=str(item.get("entry_style", "watchlist")).strip().lower(),
                    confidence=float(item.get("confidence", 0.0)),
                )
            )

    top_3_buys: list[StockIdea] = []
    if isinstance(raw_top_buys, list):
        for item in raw_top_buys:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol", "")).strip().upper()
            sector = str(item.get("sector", "")).strip()
            if not symbol or not sector:
                continue
            top_3_buys.append(
                StockIdea(
                    symbol=symbol,
                    sector=sector,
                    thesis=str(item.get("thesis", "")).strip()
                    or "No thesis returned by model.",
                    risk=str(item.get("risk", "")).strip() or "Risk details not provided.",
                    entry_style=str(item.get("entry_style", "watchlist")).strip().lower(),
                    confidence=float(item.get("confidence", 0.0)),
                )
            )

    do_not_buy: list[DoNotBuyIdea] = []
    if isinstance(raw_do_not_buy, list):
        for item in raw_do_not_buy:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol", "")).strip().upper()
            sector = str(item.get("sector", "")).strip()
            reason = str(item.get("reason", "")).strip()
            if not symbol or not sector:
                continue
            do_not_buy.append(
                DoNotBuyIdea(
                    symbol=symbol,
                    sector=sector,
                    reason=reason or "No do-not-buy rationale returned by model.",
                    confidence=float(item.get("confidence", 0.0)),
                )
            )

    forbidden_symbols = {row.symbol for row in do_not_buy}
    holdings_set = set(holdings)

    def _select_buy_candidates(
        source: list[StockIdea],
        *,
        allow_holdings: bool,
    ) -> list[StockIdea]:
        selected: list[StockIdea] = []
        seen: set[str] = set()
        for row in source:
            if row.symbol in seen:
                continue
            if row.symbol in forbidden_symbols:
                continue
            if row.confidence < min_buy_confidence:
                continue
            if not allow_holdings and row.symbol in holdings_set:
                continue
            seen.add(row.symbol)
            selected.append(row)
        return selected

    non_holding_top_buys = _select_buy_candidates(top_3_buys, allow_holdings=False)
    non_holding_stock_ideas = _select_buy_candidates(stock_ideas, allow_holdings=False)
    holding_top_buys = _select_buy_candidates(top_3_buys, allow_holdings=True)
    holding_stock_ideas = _select_buy_candidates(stock_ideas, allow_holdings=True)

    if non_holding_top_buys:
        top_3_buys = non_holding_top_buys[:3]
    elif non_holding_stock_ideas:
        top_3_buys = sorted(
            non_holding_stock_ideas, key=lambda row: row.confidence, reverse=True
        )[:3]
    elif holding_top_buys:
        top_3_buys = holding_top_buys[:3]
    else:
        top_3_buys = sorted(
            holding_stock_ideas, key=lambda row: row.confidence, reverse=True
        )[:3]

    if not raw_macro:
        raw_macro = "No macro summary returned by model."

    return MarketResearchResponse(
        holdings_review=holdings_review,
        sector_outlook=sector_outlook,
        stock_ideas=stock_ideas,
        top_3_buys=top_3_buys[:3],
        do_not_buy=do_not_buy,
        macro_summary=raw_macro,
        generated_at=generated_at,
    )


async def _run_openai_agents_recommendations_async(
    *,
    settings: Any,
    symbols: list[str],
    require_research_context: bool,
) -> tuple[list[Recommendation], list[str]]:
    from agents import Agent, Runner

    runtime = OpenAIAgentsRuntime(settings)
    runtime.ensure_openai_api_key()
    groups = runtime.mcp_server_groups()
    configured_debug = runtime.debug_snapshot()
    _set_last_mcp_runtime_debug(
        {
            "mode": "recommendations",
            "phase": "configured",
            "configured": configured_debug,
            "last_connected": {},
        }
    )
    now = datetime.now(timezone.utc)

    async with runtime.connected_servers(groups.researcher_params) as researcher_servers:
        researcher_instructions = settings.resolved_ai_system_prompt(
            DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT
        )
        researcher = Agent(
            name="Researcher",
            instructions=researcher_instructions,
            model=settings.resolved_ai_model(),
            mcp_servers=researcher_servers,
        )
        research_tool = researcher.as_tool(
            tool_name="Researcher",
            tool_description=(
                "Research online financial news and opportunities, then return a concise brief."
            ),
        )

        async with runtime.connected_servers(groups.trader_params) as trader_servers:
            _set_last_mcp_runtime_debug(
                {
                    "mode": "recommendations",
                    "phase": "connected",
                    "configured": configured_debug,
                    "last_connected": {
                        "researcher_server_count": len(researcher_servers),
                        "trader_server_count": len(trader_servers),
                    },
                }
            )
            advisor_instructions = settings.resolved_ai_system_prompt(
                DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
            )
            advisor = Agent(
                name="Financial Advisor",
                instructions=advisor_instructions,
                model=settings.resolved_ai_model(),
                tools=[research_tool],
                mcp_servers=trader_servers,
            )
            prompt = _build_user_prompt(symbols)
            if require_research_context:
                prompt += (
                    "\nYou MUST call the `Researcher` tool once before finalizing your JSON."
                )
            result = await Runner.run(advisor, prompt, max_turns=30)

    final_text = str(getattr(result, "final_output", "")).strip()
    if not final_text:
        raise ValueError("Model did not return final content.")

    recommendations = _extract_recommendations_from_model_output(
        model_output=final_text,
        symbols=symbols,
        generated_at=now,
    )
    tools_used = ["Researcher"] if require_research_context else []
    return recommendations, tools_used


def _run_openai_agents_recommendations(
    *,
    settings: Any,
    symbols: list[str],
    require_research_context: bool,
) -> tuple[list[Recommendation], list[str]]:
    return _run_async(
        _run_openai_agents_recommendations_async(
            settings=settings,
            symbols=symbols,
            require_research_context=require_research_context,
        )
    )


async def _run_openai_agents_research_async(
    *,
    settings: Any,
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    strategy_growth_pct: float,
    strategy_fixed_pct: float,
    require_web_search: bool,
) -> MarketResearchResponse:
    from agents import Agent, Runner

    runtime = OpenAIAgentsRuntime(settings)
    runtime.ensure_openai_api_key()
    groups = runtime.mcp_server_groups()
    configured_debug = runtime.debug_snapshot()
    _set_last_mcp_runtime_debug(
        {
            "mode": "research",
            "phase": "configured",
            "configured": configured_debug,
            "last_connected": {},
        }
    )
    now = datetime.now(timezone.utc)

    async with runtime.connected_servers(groups.researcher_params) as researcher_servers:
        _set_last_mcp_runtime_debug(
            {
                "mode": "research",
                "phase": "connected",
                "configured": configured_debug,
                "last_connected": {
                    "researcher_server_count": len(researcher_servers),
                    "trader_server_count": 0,
                },
            }
        )
        instructions = settings.resolved_ai_system_prompt(
            DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT
        )
        researcher = Agent(
            name="Researcher",
            instructions=instructions,
            model=settings.resolved_ai_model(),
            mcp_servers=researcher_servers,
        )
        prompt = _build_research_user_prompt(
            holdings=holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            strategy_growth_pct=strategy_growth_pct,
            strategy_fixed_pct=strategy_fixed_pct,
        )
        if require_web_search:
            prompt += (
                "\nUse web-facing MCP tools for current internet evidence before finalizing."
            )
        result = await Runner.run(researcher, prompt, max_turns=30)

    final_text = str(getattr(result, "final_output", "")).strip()
    if not final_text:
        raise ValueError("Model did not return final research payload.")

    return _extract_market_research_from_model_output(
        model_output=final_text,
        holdings=holdings,
        min_buy_confidence=min_buy_confidence,
        generated_at=now,
    )


def _run_openai_agents_research(
    *,
    settings: Any,
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    strategy_growth_pct: float,
    strategy_fixed_pct: float,
    require_web_search: bool,
) -> MarketResearchResponse:
    return _run_async(
        _run_openai_agents_research_async(
            settings=settings,
            holdings=holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            strategy_growth_pct=strategy_growth_pct,
            strategy_fixed_pct=strategy_fixed_pct,
            require_web_search=require_web_search,
        )
    )


def generate_initial_recommendations(symbols: list[str]) -> list[Recommendation]:
    settings = get_settings()
    research_agent = ResearchAgent(settings=settings)
    advisor_agent = FinancialAdvisorAgent(
        settings=settings,
        delegated_tool_provider=research_agent,
    )
    normalized_symbols = _normalize_symbols(symbols)
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
        recommendations, tools_used = _run_openai_agents_recommendations(
            settings=settings,
            symbols=normalized_symbols,
            require_research_context=require_research_context,
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
        logger.exception(
            "Live OpenAI recommendation run cancelled. Falling back to scaffold."
        )
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
        logger.exception(
            "Live OpenAI recommendation run failed. Falling back to scaffold."
        )
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
) -> MarketResearchResponse:
    settings = get_settings()
    research_agent = ResearchAgent(settings=settings)
    normalized_holdings = _normalize_symbols(holdings)
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
        _clamp_strategy_growth(strategy_growth_pct),
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
        return _run_openai_agents_research(
            settings=settings,
            holdings=normalized_holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            strategy_growth_pct=_clamp_strategy_growth(strategy_growth_pct),
            strategy_fixed_pct=max(0.0, min(100.0, float(strategy_fixed_pct))),
            require_web_search=require_web_search,
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
) -> MorningBriefingResponse:
    settings = get_settings()
    normalized_holdings = _normalize_symbols(holdings)
    research_focus = _default_morning_focus(focus)
    clamped_growth_pct = _clamp_strategy_growth(strategy_growth_pct)
    clamped_fixed_pct = max(0.0, min(100.0, float(strategy_fixed_pct)))
    research = generate_market_research(
        holdings=normalized_holdings,
        focus=research_focus,
        strategy_growth_pct=clamped_growth_pct,
        strategy_fixed_pct=clamped_fixed_pct,
    )

    holdings_actions = [
        HoldingAction(
            symbol=row.symbol,
            action=_map_research_stance_to_action(row.stance),
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
    cash_deployment_options = _build_cash_deployment_options(
        candidates=research.top_3_buys if can_deploy else [],
        deployable_cash_budget=deployable_cash_budget,
        strategy_growth_pct=clamped_growth_pct,
    )
    if not cash_deployment_options and research.top_3_buys and (holdings_snapshot or []):
        rotation_target_budget = max(min_cash_to_deploy, 0.0)
        cash_deployment_options = _build_cash_deployment_options(
            candidates=research.top_3_buys,
            deployable_cash_budget=rotation_target_budget,
            strategy_growth_pct=clamped_growth_pct,
        )
    execution_recommendations = _build_execution_recommendations(
        holdings_actions=holdings_actions,
        cash_deployment_options=cash_deployment_options,
        holdings_snapshot=holdings_snapshot or [],
        deployable_cash_budget=deployable_cash_budget,
    )

    return MorningBriefingResponse(
        execution_mode="manual",
        holdings_actions=holdings_actions,
        cash_deployment_options=cash_deployment_options,
        cash_available=safe_cash_available,
        reserve_ratio=reserve_ratio,
        reserve_cash_target=reserve_cash_target,
        deployable_cash_budget=deployable_cash_budget,
        execution_recommendations=execution_recommendations,
        macro_news_summary=research.macro_summary,
        risk_flags=_build_risk_flags(research),
        generated_at=research.generated_at,
    )


def persist_morning_briefing(briefing: MorningBriefingResponse) -> str:
    _ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = briefing.generated_at.strftime("%Y%m%d%H%M%S")
    path = _ARTIFACTS_DIR / f"morning_briefing_{run_id}.json"
    path.write_text(
        json.dumps(briefing.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return str(path)


def latest_persisted_morning_briefing() -> MorningBriefingResponse | None:
    files = sorted(_ARTIFACTS_DIR.glob(_MORNING_BRIEFING_FILE_GLOB))
    if not files:
        return None
    try:
        payload = json.loads(files[-1].read_text(encoding="utf-8"))
        return MorningBriefingResponse.model_validate(payload)
    except (OSError, ValueError, ValidationError):
        return None


def generate_and_persist_morning_briefing(
    *,
    holdings: list[str],
    holdings_snapshot: list[HoldingSnapshot] | None = None,
    cash_available: float,
    strategy_growth_pct: float = 60.0,
    strategy_fixed_pct: float = 40.0,
    focus: str = "",
) -> MorningBriefingResponse:
    briefing = generate_morning_briefing(
        holdings=holdings,
        holdings_snapshot=holdings_snapshot,
        cash_available=cash_available,
        strategy_growth_pct=strategy_growth_pct,
        strategy_fixed_pct=strategy_fixed_pct,
        focus=focus,
    )
    persist_morning_briefing(briefing)
    return briefing

def latest_pipeline_run_summary() -> dict[str, str | int]:
    return {
        "status": "ok",
        "last_run": datetime.now(timezone.utc).isoformat(),
        "documents_processed": 0,
    }


def runtime_health_details() -> dict[str, Any]:
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
    return details
