import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.agents.research_agent import ResearchAgent
from app.core.config import Settings


class _FakeNewsResponse:
    status_code = 200
    text = """
<rss>
  <channel>
    <item>
      <title>Semiconductor stocks rally on demand outlook</title>
      <link>https://example.com/news/semis</link>
      <pubDate>Wed, 18 Mar 2026 09:00:00 GMT</pubDate>
      <source url="https://example.com">Example News</source>
    </item>
  </channel>
</rss>
"""

    def raise_for_status(self) -> None:
        return None


class _FakeSectorResponse:
    status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "quoteResponse": {
                "result": [
                    {
                        "symbol": "XLK",
                        "regularMarketPrice": 230.0,
                        "regularMarketPreviousClose": 220.0,
                    },
                    {
                        "symbol": "XLE",
                        "regularMarketPrice": 90.0,
                        "regularMarketPreviousClose": 92.0,
                    },
                ]
            }
        }


class _FakeWebSearchResponse:
    status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "organic": [
                {
                    "title": "AI chip demand stays strong",
                    "link": "https://example.com/ai-chip-demand",
                    "snippet": "Demand remains elevated into next quarter.",
                }
            ]
        }


def test_research_agent_exposes_news_and_sector_tools() -> None:
    agent = ResearchAgent(settings=Settings())
    tool_names = [tool.get("name") for tool in agent.tool_schemas()]
    assert "search_web" in tool_names
    assert "search_investment_news" in tool_names
    assert "get_sector_performance" in tool_names
    assert "search_skills" in tool_names
    assert "read_skill" in tool_names
    assert "run_market_research" not in tool_names


def test_search_investment_news_returns_articles(monkeypatch: Any) -> None:
    settings = Settings()
    agent = ResearchAgent(settings=settings)

    def _fake_get(*_: Any, **__: Any) -> _FakeNewsResponse:
        return _FakeNewsResponse()

    monkeypatch.setattr("app.agents.research_agent.httpx.get", _fake_get)
    payload = agent.execute_tool(
        "search_investment_news",
        {"query": "semiconductors", "holdings": ["NVDA"], "limit": 3},
    )
    assert "Semiconductor stocks rally" in payload
    assert '"returned": 1' in payload


def test_get_sector_performance_sorts_by_pct_change(monkeypatch: Any) -> None:
    settings = Settings()
    agent = ResearchAgent(settings=settings)

    def _fake_get(*_: Any, **__: Any) -> _FakeSectorResponse:
        return _FakeSectorResponse()

    monkeypatch.setattr("app.agents.research_agent.httpx.get", _fake_get)
    payload = agent.execute_tool("get_sector_performance", {"limit": 2})
    assert '"sector": "Technology"' in payload
    assert '"sector": "Energy"' in payload


def test_search_web_returns_results(monkeypatch: Any) -> None:
    settings = Settings(SERPER_API_KEY="serper-test-key")
    agent = ResearchAgent(settings=settings)

    def _fake_post(*_: Any, **__: Any) -> _FakeWebSearchResponse:
        return _FakeWebSearchResponse()

    monkeypatch.setattr("app.agents.research_agent.httpx.post", _fake_post)
    payload = agent.execute_tool(
        "search_web",
        {"query": "semiconductor earnings guidance", "limit": 3},
    )
    assert "AI chip demand stays strong" in payload
    assert '"returned": 1' in payload
