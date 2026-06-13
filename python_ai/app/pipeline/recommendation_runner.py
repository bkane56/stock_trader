"""OpenAI Agents SDK runner: executes recommendations and research, with JSON parsing and fallback."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.openai_agents_runtime import OpenAIAgentsRuntime
from app.agents.prompts import (
    DAY_TRADER_FINANCIAL_ADVISOR_SYSTEM_PROMPT,
    DAY_TRADER_RESEARCH_AGENT_SYSTEM_PROMPT,
    DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT,
    DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT,
)
from app.schemas.recommendations import (
    DoNotBuyIdea,
    HoldingResearch,
    MarketResearchResponse,
    Recommendation,
    SectorResearch,
    StockIdea,
)
from app.pipeline.briefing_logic import strategy_context_text

logger = logging.getLogger(__name__)


def _run_async(coro: Any) -> Any:
    """Run an async coroutine from a synchronous context without an event loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Sync pipeline methods are expected to run outside active event loops.
    raise RuntimeError(
        "OpenAI Agents SDK execution requires sync context without a running event loop."
    )


def _financial_advisor_prompt_for_mode(*, autonomous_mode: bool) -> str:
    return (
        DAY_TRADER_FINANCIAL_ADVISOR_SYSTEM_PROMPT
        if autonomous_mode
        else DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
    )


def _research_agent_prompt_for_mode(*, autonomous_mode: bool) -> str:
    return (
        DAY_TRADER_RESEARCH_AGENT_SYSTEM_PROMPT
        if autonomous_mode
        else DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT
    )


def build_user_prompt(symbols: list[str]) -> str:
    """Build the user-facing prompt for the financial advisor agent."""
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


def build_research_user_prompt(
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    strategy_growth_pct: float,
    strategy_fixed_pct: float,
) -> str:
    """Build the user-facing prompt for the research agent."""
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
        f"{strategy_context_text(strategy_growth_pct, strategy_fixed_pct)}\n"
        "When several top_3_buys meet the threshold, prefer comparable confidence scores so "
        "deployable cash can split into smaller amounts across multiple securities rather than "
        "one oversized concentration.\n"
        "Adjust recommendations to respect this strategy tilt and avoid over-concentrating "
        "new cash deployment into a single symbol when alternatives are similarly compelling. "
        "When similarly strong opportunities exist, prefer diversification across sectors "
        "instead of concentrating top buys in one sector/theme.\n"
        "Use decisive language and make definitive stances for each current holding and each "
        "buy idea so recommendations are directly executable.\n"
        "Target a portfolio footprint of 4 to 10 total securities after proposed actions; "
        "prioritize buys when under-diversified and rotations/trims when over-concentrated.\n"
        f"Current holdings: {holdings_text}\n"
        f"Research focus: {focus_text}\n"
        "Return STRICT JSON with this exact top-level shape and no markdown:\n"
        "{"
        '"holdings_review":[{"symbol":"AAPL","stance":"add|hold|trim|exit|watch",'
        '"confidence":0.0,"reason":"..."}],'
        '"sector_outlook":[{"sector":"Technology","ticker":"XLK",'
        '"momentum":"strong|neutral|weak","summary":"..."}],'
        '"stock_ideas":[{"symbol":"NVDA","sector":"Technology","thesis":"...",'
        '"company_name":"NVIDIA Corporation","risk":"...",'
        '"entry_style":"immediate|pullback|watchlist","confidence":0.0}],'
        '"top_3_buys":[{"symbol":"NVDA","sector":"Technology","thesis":"...",'
        '"company_name":"NVIDIA Corporation","risk":"...",'
        '"entry_style":"pullback","confidence":0.0}],'
        '"do_not_buy":[{"symbol":"XYZ","sector":"Utilities","reason":"...",'
        '"confidence":0.0}],'
        '"macro_summary":"..."'
        "}"
    )


def extract_recommendations_from_model_output(
    model_output: str,
    symbols: list[str],
    generated_at: datetime,
) -> list[Recommendation]:
    """Parse model JSON output into Recommendation objects, with per-symbol fallbacks."""
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
        parsed.append(
            Recommendation(
                symbol=symbol,
                action=str(item.get("action", "hold")).strip().lower(),
                confidence=float(item.get("confidence", 0.0)),
                rationale=str(item.get("rationale", "")).strip()
                or "No rationale returned by model.",
                generated_at=generated_at,
            )
        )

    parsed_by_symbol = {rec.symbol: rec for rec in parsed}
    return [
        parsed_by_symbol.get(
            symbol,
            Recommendation(
                symbol=symbol,
                action="hold",
                confidence=0.2,
                rationale=(
                    "Model did not return a recommendation for this symbol; defaulted to hold."
                ),
                generated_at=generated_at,
            ),
        )
        for symbol in symbols
    ]


def _parse_stock_ideas(raw_items: Any) -> list[StockIdea]:
    stock_ideas: list[StockIdea] = []
    if not isinstance(raw_items, list):
        return stock_ideas
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol", "")).strip().upper()
        sector = str(item.get("sector", "")).strip()
        if not symbol or not sector:
            continue
        stock_ideas.append(
            StockIdea(
                symbol=symbol,
                company_name=str(item.get("company_name", item.get("name", ""))).strip(),
                sector=sector,
                thesis=str(item.get("thesis", "")).strip()
                or "No thesis returned by model.",
                risk=str(item.get("risk", "")).strip() or "Risk details not provided.",
                entry_style=str(item.get("entry_style", "watchlist")).strip().lower(),
                confidence=float(item.get("confidence", 0.0)),
            )
        )
    return stock_ideas


def extract_market_research_from_model_output(
    model_output: str,
    holdings: list[str],
    min_buy_confidence: float,
    generated_at: datetime,
) -> MarketResearchResponse:
    """Parse model JSON output into a MarketResearchResponse with diversification logic."""
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

    stock_ideas = _parse_stock_ideas(raw_ideas)
    top_3_buys = _parse_stock_ideas(raw_top_buys)

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
            if row.symbol in seen or row.symbol in forbidden_symbols:
                continue
            if row.confidence < min_buy_confidence:
                continue
            if not allow_holdings and row.symbol in holdings_set:
                continue
            seen.add(row.symbol)
            selected.append(row)
        return selected

    def _build_diversified_top_buys(
        primary: list[StockIdea],
        fallback: list[StockIdea],
    ) -> list[StockIdea]:
        pool = [(0, idx, row) for idx, row in enumerate(primary)] + [
            (1, idx, row) for idx, row in enumerate(fallback)
        ]
        ranked = sorted(pool, key=lambda item: (item[0], -item[2].confidence, item[1]))
        selected: list[StockIdea] = []
        used_symbols: set[str] = set()
        used_sectors: set[str] = set()

        for _, _, row in ranked:
            if row.symbol in used_symbols or row.sector.strip().lower() in used_sectors:
                continue
            selected.append(row)
            used_symbols.add(row.symbol)
            used_sectors.add(row.sector.strip().lower())
            if len(selected) >= 3:
                return selected

        for _, _, row in ranked:
            if row.symbol in used_symbols:
                continue
            selected.append(row)
            used_symbols.add(row.symbol)
            if len(selected) >= 3:
                break

        return selected

    non_holding_top_buys = _select_buy_candidates(top_3_buys, allow_holdings=False)
    non_holding_stock_ideas = _select_buy_candidates(stock_ideas, allow_holdings=False)
    holding_top_buys = _select_buy_candidates(top_3_buys, allow_holdings=True)
    holding_stock_ideas = _select_buy_candidates(stock_ideas, allow_holdings=True)

    if non_holding_top_buys or non_holding_stock_ideas:
        top_3_buys = _build_diversified_top_buys(non_holding_top_buys, non_holding_stock_ideas)
    elif holding_top_buys or holding_stock_ideas:
        top_3_buys = _build_diversified_top_buys(holding_top_buys, holding_stock_ideas)
    else:
        top_3_buys = []

    return MarketResearchResponse(
        holdings_review=holdings_review,
        sector_outlook=sector_outlook,
        stock_ideas=stock_ideas,
        top_3_buys=top_3_buys[:3],
        do_not_buy=do_not_buy,
        macro_summary=raw_macro or "No macro summary returned by model.",
        generated_at=generated_at,
    )


async def _run_openai_agents_recommendations_async(
    *,
    settings: Any,
    symbols: list[str],
    require_research_context: bool,
    autonomous_mode: bool = False,
    set_mcp_debug_fn: Any = None,
) -> tuple[list[Recommendation], list[str]]:
    from agents import Agent, Runner

    runtime = OpenAIAgentsRuntime(settings)
    runtime.ensure_openai_api_key()
    groups = runtime.mcp_server_groups()
    configured_debug = runtime.debug_snapshot()
    if set_mcp_debug_fn:
        set_mcp_debug_fn(
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
            _research_agent_prompt_for_mode(autonomous_mode=autonomous_mode)
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
            if set_mcp_debug_fn:
                set_mcp_debug_fn(
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
                _financial_advisor_prompt_for_mode(autonomous_mode=autonomous_mode)
            )
            advisor = Agent(
                name="Financial Advisor",
                instructions=advisor_instructions,
                model=settings.resolved_ai_model(),
                tools=[research_tool],
                mcp_servers=trader_servers,
            )
            prompt = build_user_prompt(symbols)
            if require_research_context:
                prompt += (
                    "\nYou MUST call the `Researcher` tool once before finalizing your JSON."
                )
            result = await Runner.run(
                advisor,
                prompt,
                max_turns=int(settings.RECOMMENDATION_MAX_TURNS),
            )

    final_text = str(getattr(result, "final_output", "")).strip()
    if not final_text:
        raise ValueError("Model did not return final content.")

    recommendations = extract_recommendations_from_model_output(
        model_output=final_text,
        symbols=symbols,
        generated_at=now,
    )
    tools_used = ["Researcher"] if require_research_context else []
    return recommendations, tools_used


def run_openai_agents_recommendations(
    *,
    settings: Any,
    symbols: list[str],
    require_research_context: bool,
    autonomous_mode: bool = False,
    set_mcp_debug_fn: Any = None,
) -> tuple[list[Recommendation], list[str]]:
    """Synchronous wrapper for the recommendations agent run."""
    return _run_async(
        _run_openai_agents_recommendations_async(
            settings=settings,
            symbols=symbols,
            require_research_context=require_research_context,
            autonomous_mode=autonomous_mode,
            set_mcp_debug_fn=set_mcp_debug_fn,
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
    autonomous_mode: bool = False,
    set_mcp_debug_fn: Any = None,
) -> MarketResearchResponse:
    from agents import Agent, Runner

    runtime = OpenAIAgentsRuntime(settings)
    runtime.ensure_openai_api_key()
    groups = runtime.mcp_server_groups()
    configured_debug = runtime.debug_snapshot()
    if set_mcp_debug_fn:
        set_mcp_debug_fn(
            {
                "mode": "research",
                "phase": "configured",
                "configured": configured_debug,
                "last_connected": {},
            }
        )
    now = datetime.now(timezone.utc)

    async with runtime.connected_servers(groups.researcher_params) as researcher_servers:
        if set_mcp_debug_fn:
            set_mcp_debug_fn(
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
            _research_agent_prompt_for_mode(autonomous_mode=autonomous_mode)
        )
        researcher = Agent(
            name="Researcher",
            instructions=instructions,
            model=settings.resolved_ai_model(),
            mcp_servers=researcher_servers,
        )
        prompt = build_research_user_prompt(
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
        result = await Runner.run(
            researcher,
            prompt,
            max_turns=int(settings.RESEARCH_MAX_TURNS),
        )

    final_text = str(getattr(result, "final_output", "")).strip()
    if not final_text:
        raise ValueError("Model did not return final research payload.")

    return extract_market_research_from_model_output(
        model_output=final_text,
        holdings=holdings,
        min_buy_confidence=min_buy_confidence,
        generated_at=now,
    )


def run_openai_agents_research(
    *,
    settings: Any,
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    strategy_growth_pct: float,
    strategy_fixed_pct: float,
    require_web_search: bool,
    autonomous_mode: bool = False,
    set_mcp_debug_fn: Any = None,
) -> MarketResearchResponse:
    """Synchronous wrapper for the research agent run."""
    return _run_async(
        _run_openai_agents_research_async(
            settings=settings,
            holdings=holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            strategy_growth_pct=strategy_growth_pct,
            strategy_fixed_pct=strategy_fixed_pct,
            require_web_search=require_web_search,
            autonomous_mode=autonomous_mode,
            set_mcp_debug_fn=set_mcp_debug_fn,
        )
    )
