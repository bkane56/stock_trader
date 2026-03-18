from collections import deque
from dataclasses import dataclass
import json
import math
from pathlib import Path
import time
from threading import Lock
from typing import Any

import httpx

from app.agents.prompts import DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
from app.agents.skills_catalog import SkillsCatalog
from app.core.config import Settings

_POLYGON_CALL_TIMESTAMPS: deque[float] = deque()
_POLYGON_CALL_LOCK = Lock()
_POLYGON_CALLS_PER_MINUTE_LIMIT = 5
_POLYGON_CACHE_TTL_SECONDS = 300


@dataclass(frozen=True)
class AgentIdentity:
    provider: str
    model: str


class FinancialAdvisorAgent:
    def __init__(
        self,
        settings: Settings,
        delegated_tool_provider: Any | None = None,
    ) -> None:
        self._settings = settings
        self._polygon_cache: dict[str, dict[str, Any]] = {}
        self._delegated_tool_provider = delegated_tool_provider
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
            DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
        )
        skills_context = self._skills.prompt_context(
            max_visible_skills=self._settings.AI_SKILLS_PROMPT_LIMIT
        )
        polygon_context = (
            "Polygon market-data tool is available: call `get_polygon_snapshot` for "
            "each ticker before concluding. This tool returns end-of-day compatible "
            "market context (previous close aggregate), not real-time intraday ticks. "
            "Respect the free-plan limit of 5 calls per minute by minimizing requests."
            if self._settings.POLYGON_API_KEY.strip()
            else "Polygon market-data tool is unavailable because POLYGON_API_KEY is missing."
        )
        return f"{base_prompt}\n\n{polygon_context}\n\n{skills_context}"

    def rationale_prefix(self) -> str:
        identity = self.identity
        return f"Agent={identity.provider}:{identity.model}"

    def tool_schemas(self) -> list[dict[str, Any]]:
        delegated_tools: list[dict[str, Any]] = []
        if self._delegated_tool_provider is not None and hasattr(
            self._delegated_tool_provider, "functional_tool_schemas"
        ):
            delegated_tools = self._delegated_tool_provider.functional_tool_schemas()
        return [
            self._polygon_tool_schema(),
            *delegated_tools,
            *self._skills.tool_schemas(),
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> str:
        if tool_name == "get_polygon_snapshot":
            symbol = str(arguments.get("symbol", "")).strip().upper()
            return self._get_polygon_snapshot(symbol=symbol)
        if self._delegated_tool_provider is not None and hasattr(
            self._delegated_tool_provider, "execute_functional_tool"
        ):
            delegated_output = self._delegated_tool_provider.execute_functional_tool(
                tool_name=tool_name,
                arguments=arguments,
            )
            if delegated_output is not None:
                return delegated_output
        return self._skills.execute_tool(tool_name=tool_name, arguments=arguments)

    def _polygon_tool_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "name": "get_polygon_snapshot",
            "description": (
                "Fetch Polygon end-of-day market data for one US ticker symbol. "
                "This project assumes free-plan limits (about 5 calls/min)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Ticker symbol, for example SPY or AAPL.",
                    }
                },
                "required": ["symbol"],
                "additionalProperties": False,
            },
        }

    def _get_polygon_snapshot(self, symbol: str) -> str:
        if not symbol:
            return json.dumps({"error": "symbol is required"})

        api_key = self._settings.POLYGON_API_KEY.strip()
        if not api_key:
            return json.dumps({"error": "POLYGON_API_KEY is missing"})
        cached = self._get_cached_polygon_result(symbol)
        if cached is not None:
            return json.dumps(cached)

        rate_limit = self._polygon_rate_limit_status()
        if rate_limit["is_limited"]:
            retry_after_seconds = rate_limit["retry_after_seconds"]
            # Auto-retry quickly for short waits to reduce user-visible delays.
            if retry_after_seconds <= 3:
                time.sleep(retry_after_seconds)
                rate_limit = self._polygon_rate_limit_status()
            if rate_limit["is_limited"]:
                retry_after_seconds = rate_limit["retry_after_seconds"]
                return json.dumps(
                    {
                        "symbol": symbol,
                        "error": (
                            "Polygon free-plan rate limit reached (5 calls/min). "
                            "Retry after a short delay."
                        ),
                        "retry_after_seconds": retry_after_seconds,
                    }
                )

        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/prev"
        payload: dict[str, Any] | None = None
        last_error: str = ""
        for attempt in range(3):
            try:
                response = httpx.get(
                    url,
                    params={"apiKey": api_key},
                    timeout=10.0,
                )
                if response.status_code in {429, 500, 502, 503, 504} and attempt < 2:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                response.raise_for_status()
                payload = response.json()
                break
            except httpx.HTTPError as exc:
                last_error = str(exc)
                if attempt < 2:
                    time.sleep(0.5 * (attempt + 1))
                    continue
            except ValueError as exc:
                return json.dumps(
                    {"error": f"Polygon response decode failed for {symbol}: {exc}"}
                )

        if payload is None:
            return json.dumps(
                {
                    "symbol": symbol,
                    "error": f"Polygon request failed for {symbol}: {last_error}",
                }
            )

        if not isinstance(payload, dict):
            return json.dumps(
                {
                    "symbol": symbol,
                    "error": "Polygon response is not a valid object.",
                }
            )

        results = payload.get("results")
        if not isinstance(results, list) or not results:
            return json.dumps(
                {
                    "symbol": symbol,
                    "error": "Polygon response did not include previous-close results.",
                }
            )
        previous = results[0] if isinstance(results[0], dict) else {}

        result = {
            "symbol": symbol,
            "data_source": "polygon_prev_close",
            "adjusted": payload.get("adjusted"),
            "query_count": payload.get("queryCount"),
            "results_count": payload.get("resultsCount"),
            "previous_day": {
                "open": previous.get("o"),
                "high": previous.get("h"),
                "low": previous.get("l"),
                "close": previous.get("c"),
                "volume": previous.get("v"),
                "vwap": previous.get("vw"),
                "trade_count": previous.get("n"),
                "timestamp": previous.get("t"),
            },
        }
        self._set_cached_polygon_result(symbol, result)
        return json.dumps(result)

    def _polygon_rate_limit_status(self) -> dict[str, int | bool]:
        now = time.time()
        with _POLYGON_CALL_LOCK:
            while _POLYGON_CALL_TIMESTAMPS and now - _POLYGON_CALL_TIMESTAMPS[0] > 60:
                _POLYGON_CALL_TIMESTAMPS.popleft()
            if len(_POLYGON_CALL_TIMESTAMPS) >= _POLYGON_CALLS_PER_MINUTE_LIMIT:
                oldest = _POLYGON_CALL_TIMESTAMPS[0]
                retry_after = max(1, math.ceil(60 - (now - oldest)))
                return {"is_limited": True, "retry_after_seconds": retry_after}
            _POLYGON_CALL_TIMESTAMPS.append(now)
            return {"is_limited": False, "retry_after_seconds": 0}

    def _get_cached_polygon_result(self, symbol: str) -> dict[str, Any] | None:
        cached = self._polygon_cache.get(symbol)
        if not cached:
            return None
        cached_at = float(cached.get("cached_at_epoch", 0))
        if time.time() - cached_at > _POLYGON_CACHE_TTL_SECONDS:
            self._polygon_cache.pop(symbol, None)
            return None
        payload = dict(cached.get("payload", {}))
        payload["cache_hit"] = True
        payload["cache_ttl_seconds"] = _POLYGON_CACHE_TTL_SECONDS
        return payload

    def _set_cached_polygon_result(self, symbol: str, payload: dict[str, Any]) -> None:
        self._polygon_cache[symbol] = {
            "cached_at_epoch": time.time(),
            "payload": dict(payload),
        }
