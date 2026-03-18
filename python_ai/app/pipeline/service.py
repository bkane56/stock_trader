import json
import logging
from threading import Lock
from datetime import datetime, timezone
from typing import Any

from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.research_agent import ResearchAgent
from app.core.config import get_settings
from app.schemas.recommendations import (
    DoNotBuyIdea,
    HoldingResearch,
    MarketResearchResponse,
    Recommendation,
    SectorResearch,
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


def _create_openai_client(api_key: str) -> Any:
    from openai import OpenAI

    return OpenAI(api_key=api_key)


def _chat_tools_from_agent(agent: Any) -> list[dict[str, Any]]:
    chat_tools: list[dict[str, Any]] = []
    for schema in agent.tool_schemas():
        if schema.get("type") != "function":
            continue
        name = str(schema.get("name", "")).strip()
        if not name:
            continue
        chat_tools.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": schema.get("description", ""),
                    "parameters": schema.get("parameters", {"type": "object"}),
                },
            }
        )
    return chat_tools


def _build_user_prompt(symbols: list[str]) -> str:
    return (
        "Create one recommendation per ticker using only provided context and any "
        "tools you call.\n"
        "Before final recommendations, call `get_polygon_snapshot` for each ticker "
        "to gather end-of-day market context.\n"
        "If you need broader context, call `run_market_research` first, then use that "
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
) -> str:
    holdings_text = ", ".join(holdings) if holdings else "(none)"
    focus_text = focus.strip() or "broad market opportunities"
    return (
        "Build a practical market research brief for an active trader.\n"
        "Before finalizing, gather internet evidence and skill guidance with tools.\n"
        "First call `search_web` for broad context, then call `search_investment_news`.\n"
        "When relevant, call `search_skills` and `read_skill` for specialized workflows.\n"
        "Use `get_sector_performance` for momentum context.\n"
        f"Minimum confidence for top_3_buys is {min_buy_confidence:.2f}.\n"
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
    top_3_buys = [
        row
        for row in top_3_buys
        if row.symbol not in forbidden_symbols and row.confidence >= min_buy_confidence
    ]

    if not top_3_buys:
        top_3_buys = sorted(
            [
                row
                for row in stock_ideas
                if row.symbol not in forbidden_symbols
                and row.confidence >= min_buy_confidence
            ],
            key=lambda row: row.confidence,
            reverse=True,
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


def _run_openai_tool_loop(
    advisor_agent: FinancialAdvisorAgent,
    symbols: list[str],
    require_research_context: bool,
    api_key: str,
) -> tuple[list[Recommendation], list[str]]:
    now = datetime.now(timezone.utc)
    client = _create_openai_client(api_key=api_key)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": advisor_agent.system_prompt()},
        {"role": "user", "content": _build_user_prompt(symbols)},
    ]
    tools = _chat_tools_from_agent(advisor_agent)
    logger.info(
        "Recommendation run using OpenAI model=%s symbols=%s tools=%d",
        advisor_agent.identity.model,
        ",".join(symbols),
        len(tools),
    )

    final_text = ""
    called_tools: set[str] = set()
    for turn in range(8):
        response = client.chat.completions.create(
            model=advisor_agent.identity.model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
        message = response.choices[0].message
        tool_calls = message.tool_calls or []

        if tool_calls:
            logger.info(
                "Model requested %d tool call(s) on turn %d.",
                len(tool_calls),
                turn + 1,
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": call.type,
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                        for call in tool_calls
                    ],
                }
            )
            for call in tool_calls:
                called_tools.add(call.function.name)
                try:
                    arguments = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError:
                    logger.warning(
                        "Tool arguments were invalid JSON for tool=%s; using empty object.",
                        call.function.name,
                    )
                    arguments = {}
                logger.info("Executing tool call: %s", call.function.name)
                tool_output = advisor_agent.execute_tool(
                    tool_name=call.function.name,
                    arguments=arguments,
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": tool_output,
                    }
                )
            continue

        final_text = (message.content or "").strip()
        tool_names = {
            str(item.get("function", {}).get("name", "")).strip()
            for item in tools
            if isinstance(item, dict)
        }
        if (
            require_research_context
            and "run_market_research" in tool_names
            and "run_market_research" not in called_tools
        ):
            messages.append(
                {
                    "role": "assistant",
                    "content": final_text,
                }
            )
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Before finalizing, you MUST call `run_market_research` once "
                        "to gather internet + sector context, then return updated strict JSON."
                    ),
                }
            )
            final_text = ""
            continue
        logger.info("Model returned final recommendation payload on turn %d.", turn + 1)
        break

    if not final_text:
        raise ValueError("Model did not return final content.")

    recommendations = _extract_recommendations_from_model_output(
        model_output=final_text,
        symbols=symbols,
        generated_at=now,
    )
    return recommendations, sorted(called_tools)


def _run_openai_research_loop(
    research_agent: ResearchAgent,
    holdings: list[str],
    focus: str,
    min_buy_confidence: float,
    require_web_search: bool,
    api_key: str,
) -> MarketResearchResponse:
    now = datetime.now(timezone.utc)
    client = _create_openai_client(api_key=api_key)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": research_agent.system_prompt()},
        {
            "role": "user",
            "content": _build_research_user_prompt(
                holdings=holdings,
                focus=focus,
                min_buy_confidence=min_buy_confidence,
            ),
        },
    ]
    tools = _chat_tools_from_agent(research_agent)
    logger.info(
        "Market research run using OpenAI model=%s holdings=%s tools=%d",
        research_agent.identity.model,
        ",".join(holdings),
        len(tools),
    )

    final_text = ""
    called_tools: set[str] = set()
    for turn in range(8):
        response = client.chat.completions.create(
            model=research_agent.identity.model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
        message = response.choices[0].message
        tool_calls = message.tool_calls or []

        if tool_calls:
            messages.append(
                {
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": call.type,
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                        for call in tool_calls
                    ],
                }
            )
            for call in tool_calls:
                called_tools.add(call.function.name)
                try:
                    arguments = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError:
                    logger.warning(
                        "Research tool arguments invalid JSON for tool=%s; using empty object.",
                        call.function.name,
                    )
                    arguments = {}
                tool_output = research_agent.execute_tool(
                    tool_name=call.function.name,
                    arguments=arguments,
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": tool_output,
                    }
                )
            continue

        final_text = (message.content or "").strip()
        if require_web_search and "search_web" not in called_tools:
            messages.append(
                {
                    "role": "assistant",
                    "content": final_text,
                }
            )
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Before finalizing, you MUST call `search_web` at least once "
                        "for current internet evidence, then return updated strict JSON."
                    ),
                }
            )
            final_text = ""
            continue
        break

    if not final_text:
        raise ValueError("Model did not return final research payload.")

    return _extract_market_research_from_model_output(
        model_output=final_text,
        holdings=holdings,
        min_buy_confidence=min_buy_confidence,
        generated_at=now,
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
        recommendations, tools_used = _run_openai_tool_loop(
            advisor_agent=advisor_agent,
            symbols=normalized_symbols,
            require_research_context=require_research_context,
            api_key=api_key,
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
    except Exception as exc:
        logger.exception(
            "Live OpenAI recommendation run failed. Falling back to scaffold."
        )
        _set_runtime_status(
            mode="fallback",
            reason=f"Live OpenAI run failed: {exc}",
            provider=provider,
            model=advisor_agent.identity.model,
        )
        _set_last_recommendation_tools_used([])
        return _scaffold_recommendations(normalized_symbols, advisor_agent)


def generate_market_research(holdings: list[str], focus: str = "") -> MarketResearchResponse:
    settings = get_settings()
    research_agent = ResearchAgent(settings=settings)
    normalized_holdings = _normalize_symbols(holdings)
    min_buy_confidence = settings.resolved_research_min_buy_confidence()
    provider = research_agent.identity.provider
    api_key = settings.resolved_ai_api_key()
    require_web_search = bool(settings.SERPER_API_KEY.strip())
    logger.info(
        "Research request provider=%s model=%s holdings=%s focus=%s min_buy_confidence=%.2f",
        provider,
        research_agent.identity.model,
        ",".join(normalized_holdings),
        focus.strip() or "<none>",
        min_buy_confidence,
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
        return _run_openai_research_loop(
            research_agent=research_agent,
            holdings=normalized_holdings,
            focus=focus,
            min_buy_confidence=min_buy_confidence,
            require_web_search=require_web_search,
            api_key=api_key,
        )
    except Exception as exc:
        logger.exception("Live OpenAI market research run failed. Returning fallback payload.")
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

def latest_pipeline_run_summary() -> dict[str, str | int]:
    return {
        "status": "ok",
        "last_run": datetime.now(timezone.utc).isoformat(),
        "documents_processed": 0,
    }


def runtime_health_details() -> dict[str, str | float | list[str]]:
    settings = get_settings()
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
    details["configured_advisor_tools"] = advisor_tool_names
    return details
