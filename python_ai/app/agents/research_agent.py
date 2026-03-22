from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx

from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.functional_tool import FunctionalToolProvider, functional_tool
from app.agents.prompts import DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT
from app.agents.skills_catalog import SkillsCatalog
from app.core.config import Settings

_SECTOR_ETFS: dict[str, str] = {
    "Communication Services": "XLC",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Energy": "XLE",
    "Financials": "XLF",
    "Health Care": "XLV",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Technology": "XLK",
    "Utilities": "XLU",
}


@dataclass(frozen=True)
class AgentIdentity:
    provider: str
    model: str


class ResearchAgent(FunctionalToolProvider):
    """Research tool surface used by the OpenAI tool loop in pipeline.service."""
    _LOCAL_SKILL_TOOL_NAMES = {"search_skills", "read_skill"}

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._advisor_delegate = FinancialAdvisorAgent(settings=settings)
        self._skills = SkillsCatalog(
            repo_root=self._repo_root(),
            index_path=self._settings.AI_SKILLS_INDEX_PATH,
            skills_root=self._settings.AI_SKILLS_ROOT_PATH,
        )

    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @property
    def identity(self) -> AgentIdentity:
        provider = self._settings.resolved_ai_provider()
        model = self._settings.resolved_ai_model()
        return AgentIdentity(provider=provider, model=model)

    def system_prompt(self) -> str:
        base_prompt = self._settings.resolved_ai_system_prompt(
            DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT
        )
        tools_context = (
            "For morning briefings, call `get_general_market_news_digest` first to collect "
            "broad stock-market and world-news context before ticker-level conclusions. "
            "Use `search_web` for broad internet search and fresh web snippets. "
            "Use `search_investment_news` to gather recent coverage by holdings, sector, "
            "or topic. Use `get_sector_performance` to compare broad sector momentum. "
            "Use `get_polygon_snapshot` for symbol-level end-of-day context when needed."
        )
        skills_context = self._skills.prompt_context(
            max_visible_skills=self._settings.AI_SKILLS_PROMPT_LIMIT
        )
        return f"{base_prompt}\n\n{tools_context}\n\n{skills_context}"

    def rationale_prefix(self) -> str:
        identity = self.identity
        return f"Agent={identity.provider}:{identity.model}"

    def tool_schemas(self) -> list[dict[str, Any]]:
        delegate_tools = [
            tool
            for tool in self._advisor_delegate.tool_schemas()
            if tool.get("name")
            not in {"run_market_research", *self._LOCAL_SKILL_TOOL_NAMES}
        ]
        return [
            self._general_market_news_digest_tool_schema(),
            self._web_search_tool_schema(),
            self._news_tool_schema(),
            self._sector_tool_schema(),
            *delegate_tools,
            *self._skills.tool_schemas(),
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> str:
        if tool_name in self._LOCAL_SKILL_TOOL_NAMES:
            return self._skills.execute_tool(tool_name=tool_name, arguments=arguments)

        if tool_name == "search_investment_news":
            query = str(arguments.get("query", "")).strip()
            holdings = [
                str(item).strip().upper()
                for item in arguments.get("holdings", [])
                if str(item).strip()
            ]
            limit_value = arguments.get("limit", 6)
            limit = limit_value if isinstance(limit_value, int) else 6
            return self._search_investment_news(
                query=query,
                holdings=holdings,
                limit=limit,
            )
        if tool_name == "search_web":
            query = str(arguments.get("query", "")).strip()
            limit_value = arguments.get("limit", 5)
            limit = limit_value if isinstance(limit_value, int) else 5
            return self._search_web(query=query, limit=limit)

        if tool_name == "get_general_market_news_digest":
            limit_value = arguments.get("limit_per_query", 3)
            limit = limit_value if isinstance(limit_value, int) else 3
            return self._general_market_news_digest(limit_per_query=limit)

        if tool_name == "get_sector_performance":
            limit_value = arguments.get("limit", 6)
            limit = limit_value if isinstance(limit_value, int) else 6
            return self._get_sector_performance(limit=limit)

        return self._advisor_delegate.execute_tool(
            tool_name=tool_name,
            arguments=arguments,
        )

    def _web_search_tool_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": "search_web",
            "description": "Search the web for recent market information and evidence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Web search query, for example 'semiconductor earnings guidance'."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of web results.",
                        "minimum": 1,
                        "maximum": 10,
                        "default": 5,
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        }

    def _general_market_news_digest_tool_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": "get_general_market_news_digest",
            "description": (
                "Collect broad market and world-news headlines to establish macro context "
                "before holdings-level recommendations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit_per_query": {
                        "type": "integer",
                        "description": "Maximum results returned per digest query.",
                        "minimum": 1,
                        "maximum": 5,
                        "default": 3,
                    }
                },
                "required": [],
                "additionalProperties": False,
            },
        }

    def _news_tool_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": "search_investment_news",
            "description": (
                "Search recent investment and stock-market news using Google News RSS."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Topic or market theme, e.g., AI semiconductors.",
                    },
                    "holdings": {
                        "type": "array",
                        "description": "Optional ticker list to prioritize.",
                        "items": {"type": "string"},
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of articles to return.",
                        "minimum": 1,
                        "maximum": 15,
                        "default": 6,
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
        }

    def _sector_tool_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": "get_sector_performance",
            "description": (
                "Fetch recent sector ETF performance and return strongest sectors first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum sector rows to return.",
                        "minimum": 1,
                        "maximum": 11,
                        "default": 6,
                    }
                },
                "required": [],
                "additionalProperties": False,
            },
        }

    def _search_investment_news(
        self,
        *,
        query: str,
        holdings: list[str],
        limit: int,
    ) -> str:
        safe_limit = max(1, min(limit, 15))
        base_query = query.strip()
        ticker_query = " OR ".join(holdings[:8]).strip()
        if base_query and ticker_query:
            composed_query = f"({base_query}) ({ticker_query}) stock market"
        elif ticker_query:
            composed_query = f"{ticker_query} stock market sectors"
        elif base_query:
            composed_query = f"{base_query} stock market sectors investing"
        else:
            composed_query = "stock market sectors investing earnings"

        params = {
            "q": composed_query,
            "hl": "en-US",
            "gl": "US",
            "ceid": "US:en",
        }
        url = f"https://news.google.com/rss/search?{urlencode(params)}"
        try:
            response = httpx.get(url, timeout=10.0)
            response.raise_for_status()
            root = ElementTree.fromstring(response.text)
        except (httpx.HTTPError, ElementTree.ParseError) as exc:
            return json.dumps(
                {"error": f"News search failed: {exc}", "query": composed_query}
            )

        items = root.findall("./channel/item")
        articles: list[dict[str, str]] = []
        for item in items[:safe_limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source_node = item.find("source")
            source = (source_node.text or "").strip() if source_node is not None else ""
            if not title or not link:
                continue
            articles.append(
                {
                    "title": title,
                    "source": source,
                    "published_at": pub_date,
                    "url": link,
                }
            )

        return json.dumps(
            {
                "query": composed_query,
                "returned": len(articles),
                "articles": articles,
            }
        )

    def _search_web(self, *, query: str, limit: int) -> str:
        safe_query = query.strip()
        if not safe_query:
            return json.dumps({"error": "query is required"})

        api_key = self._settings.SERPER_API_KEY.strip()
        if not api_key:
            return json.dumps({"error": "SERPER_API_KEY is missing"})

        safe_limit = max(1, min(limit, 10))
        try:
            response = httpx.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                json={"q": safe_query, "num": safe_limit},
                timeout=10.0,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            return json.dumps({"error": f"Web search failed: {exc}", "query": safe_query})

        organic = payload.get("organic", [])
        if not isinstance(organic, list):
            organic = []
        results: list[dict[str, str]] = []
        for item in organic[:safe_limit]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            link = str(item.get("link", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            if not title or not link:
                continue
            results.append(
                {
                    "title": title,
                    "url": link,
                    "snippet": snippet,
                }
            )

        return json.dumps(
            {
                "query": safe_query,
                "returned": len(results),
                "results": results,
            }
        )

    def _get_sector_performance(self, *, limit: int) -> str:
        safe_limit = max(1, min(limit, len(_SECTOR_ETFS)))
        symbols = ",".join(_SECTOR_ETFS.values())
        url = "https://query1.finance.yahoo.com/v7/finance/quote"
        try:
            response = httpx.get(url, params={"symbols": symbols}, timeout=10.0)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            return json.dumps({"error": f"Sector data fetch failed: {exc}"})

        quote_response = payload.get("quoteResponse", {})
        records = quote_response.get("result", [])
        if not isinstance(records, list):
            records = []
        rows: list[dict[str, Any]] = []
        inverse = {ticker: sector for sector, ticker in _SECTOR_ETFS.items()}
        for record in records:
            if not isinstance(record, dict):
                continue
            ticker = str(record.get("symbol", "")).strip().upper()
            if ticker not in inverse:
                continue
            price = record.get("regularMarketPrice")
            previous_close = record.get("regularMarketPreviousClose")
            if not isinstance(price, (float, int)) or not isinstance(
                previous_close, (float, int)
            ):
                continue
            if previous_close == 0:
                continue
            pct_change = ((float(price) - float(previous_close)) / float(previous_close)) * 100
            rows.append(
                {
                    "sector": inverse[ticker],
                    "ticker": ticker,
                    "price": float(price),
                    "previous_close": float(previous_close),
                    "pct_change": round(pct_change, 3),
                }
            )
        rows.sort(key=lambda row: row["pct_change"], reverse=True)
        return json.dumps(
            {
                "returned": len(rows[:safe_limit]),
                "as_of": "latest_market_quote",
                "sectors": rows[:safe_limit],
            }
        )

    def _general_market_news_digest(self, *, limit_per_query: int) -> str:
        safe_limit = max(1, min(limit_per_query, 5))
        topics = [
            "stock market outlook indices rates inflation",
            "global macro world news central banks energy supply chain",
            "corporate earnings guidance risk sentiment",
        ]
        digest: list[dict[str, Any]] = []
        for topic in topics:
            news_result = json.loads(
                self._search_investment_news(query=topic, holdings=[], limit=safe_limit)
            )
            web_result = json.loads(self._search_web(query=topic, limit=safe_limit))
            digest.append(
                {
                    "topic": topic,
                    "news": news_result,
                    "web": web_result,
                }
            )
        return json.dumps(
            {
                "returned_topics": len(digest),
                "limit_per_query": safe_limit,
                "digest": digest,
            }
        )

    @functional_tool(
        name="run_market_research",
        description=(
            "Delegate to the research agent to analyze holdings, sectors, top 3 buy "
            "candidates, and do-not-buy ideas."
        ),
        parameters={
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "description": (
                        "Optional current holdings tickers to evaluate (for example "
                        "['AAPL','MSFT'])."
                    ),
                    "items": {"type": "string"},
                },
                "focus": {
                    "type": "string",
                    "description": (
                        "Optional focus area for research (for example "
                        "'semiconductors and software')."
                    ),
                },
            },
            "required": [],
            "additionalProperties": False,
        },
    )
    def run_market_research_tool(
        self,
        holdings: list[str] | None = None,
        focus: str = "",
    ) -> str:
        from app.pipeline.service import generate_market_research

        raw_holdings = holdings or []
        normalized_holdings = [
            str(item).strip().upper() for item in raw_holdings if str(item).strip()
        ]
        report = generate_market_research(holdings=normalized_holdings, focus=focus)
        return json.dumps(report.model_dump(mode="json"))
