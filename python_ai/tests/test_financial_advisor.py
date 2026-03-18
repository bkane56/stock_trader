from typing import Any
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.agents.financial_advisor as financial_advisor_module
from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.research_agent import ResearchAgent
from app.core.config import Settings


class _FakeResponse:
    status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "ticker": "SPY",
            "queryCount": 1,
            "resultsCount": 1,
            "adjusted": True,
            "results": [
                {
                    "T": "SPY",
                    "v": 87122542,
                    "vw": 671.2898,
                    "o": 672.39,
                    "c": 670.79,
                    "h": 674.44,
                    "l": 669.7,
                    "t": 1773777600000,
                    "n": 915896,
                }
            ],
        }


def test_polygon_tool_schema_included() -> None:
    settings = Settings(POLYGON_API_KEY="polygon-test-key")
    agent = FinancialAdvisorAgent(settings=settings)
    tool_names = [tool.get("name") for tool in agent.tool_schemas()]
    assert "get_polygon_snapshot" in tool_names
    assert "run_market_research" not in tool_names


def test_research_functional_tool_is_exposed_when_delegated() -> None:
    settings = Settings(POLYGON_API_KEY="polygon-test-key")
    research_agent = ResearchAgent(settings=settings)
    agent = FinancialAdvisorAgent(
        settings=settings,
        delegated_tool_provider=research_agent,
    )
    tool_names = [tool.get("name") for tool in agent.tool_schemas()]
    assert "run_market_research" in tool_names


def test_market_research_tool_delegates_to_research_service(monkeypatch: Any) -> None:
    settings = Settings()
    research_agent = ResearchAgent(settings=settings)
    agent = FinancialAdvisorAgent(
        settings=settings,
        delegated_tool_provider=research_agent,
    )

    class _FakeResearchReport:
        def model_dump(self, mode: str = "json") -> dict[str, Any]:
            return {
                "holdings_review": [],
                "sector_outlook": [],
                "stock_ideas": [],
                "top_3_buys": [],
                "do_not_buy": [],
                "macro_summary": "ok",
            }

    monkeypatch.setattr(
        "app.pipeline.service.generate_market_research",
        lambda holdings, focus: _FakeResearchReport(),
    )
    output = agent.execute_tool(
        "run_market_research",
        {"holdings": ["AAPL", "MSFT"], "focus": "technology"},
    )
    assert '"macro_summary": "ok"' in output


def test_polygon_tool_executes_and_returns_snapshot(monkeypatch: Any) -> None:
    settings = Settings(POLYGON_API_KEY="polygon-test-key")
    agent = FinancialAdvisorAgent(settings=settings)

    def _fake_get(*_: Any, **__: Any) -> _FakeResponse:
        return _FakeResponse()

    monkeypatch.setattr("app.agents.financial_advisor.httpx.get", _fake_get)
    output = agent.execute_tool("get_polygon_snapshot", {"symbol": "SPY"})
    assert '"symbol": "SPY"' in output
    assert '"data_source": "polygon_prev_close"' in output
    assert '"previous_day"' in output


def test_polygon_tool_rate_limit(monkeypatch: Any) -> None:
    settings = Settings(POLYGON_API_KEY="polygon-test-key")
    agent = FinancialAdvisorAgent(settings=settings)
    financial_advisor_module._POLYGON_CALL_TIMESTAMPS.clear()

    def _fake_get(*_: Any, **__: Any) -> _FakeResponse:
        return _FakeResponse()

    monkeypatch.setattr("app.agents.financial_advisor.httpx.get", _fake_get)

    symbols = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"]
    for symbol in symbols:
        output = agent.execute_tool("get_polygon_snapshot", {"symbol": symbol})
        assert '"error"' not in output

    blocked = agent.execute_tool("get_polygon_snapshot", {"symbol": "AMD"})
    assert "rate limit reached" in blocked
    assert "retry_after_seconds" in blocked


def test_polygon_tool_cache_hit(monkeypatch: Any) -> None:
    settings = Settings(POLYGON_API_KEY="polygon-test-key")
    agent = FinancialAdvisorAgent(settings=settings)
    financial_advisor_module._POLYGON_CALL_TIMESTAMPS.clear()

    calls = {"count": 0}

    def _fake_get(*_: Any, **__: Any) -> _FakeResponse:
        calls["count"] += 1
        return _FakeResponse()

    monkeypatch.setattr("app.agents.financial_advisor.httpx.get", _fake_get)

    first = agent.execute_tool("get_polygon_snapshot", {"symbol": "SPY"})
    second = agent.execute_tool("get_polygon_snapshot", {"symbol": "SPY"})

    assert calls["count"] == 1
    assert '"cache_hit": true' not in first
    assert '"cache_hit": true' in second
