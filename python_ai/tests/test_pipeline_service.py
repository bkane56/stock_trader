import json
from dataclasses import dataclass
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.pipeline import service


@dataclass
class _FakeFunction:
    name: str
    arguments: str


@dataclass
class _FakeToolCall:
    id: str
    type: str
    function: _FakeFunction


@dataclass
class _FakeMessage:
    content: str
    tool_calls: list[_FakeToolCall] | None = None


@dataclass
class _FakeChoice:
    message: _FakeMessage


@dataclass
class _FakeResponse:
    choices: list[_FakeChoice]


class _FakeCompletions:
    def __init__(self) -> None:
        self._call_count = 0

    def create(self, **_: Any) -> _FakeResponse:
        self._call_count += 1
        if self._call_count == 1:
            return _FakeResponse(
                choices=[
                    _FakeChoice(
                        message=_FakeMessage(
                            content="",
                            tool_calls=[
                                _FakeToolCall(
                                    id="tc_1",
                                    type="function",
                                    function=_FakeFunction(
                                        name="search_skills",
                                        arguments='{"query":"risk","limit":1}',
                                    ),
                                )
                            ],
                        )
                    )
                ]
            )
        return _FakeResponse(
            choices=[
                _FakeChoice(
                    message=_FakeMessage(
                        content=json.dumps(
                            {
                                "recommendations": [
                                    {
                                        "symbol": "SPY",
                                        "action": "consider",
                                        "confidence": 0.64,
                                        "rationale": "Matched a risk-management skill.",
                                    }
                                ]
                            }
                        )
                    )
                )
            ]
        )


class _FakeChat:
    def __init__(self) -> None:
        self.completions = _FakeCompletions()


class _FakeOpenAIClient:
    def __init__(self) -> None:
        self.chat = _FakeChat()


class _FakeResearchCompletions:
    def __init__(self) -> None:
        self._call_count = 0

    def create(self, **_: Any) -> _FakeResponse:
        self._call_count += 1
        if self._call_count == 1:
            return _FakeResponse(
                choices=[
                    _FakeChoice(
                        message=_FakeMessage(
                            content="",
                            tool_calls=[
                                _FakeToolCall(
                                    id="tc_research_1",
                                    type="function",
                                    function=_FakeFunction(
                                        name="search_investment_news",
                                        arguments='{"query":"technology","limit":2}',
                                    ),
                                )
                            ],
                        )
                    )
                ]
            )
        return _FakeResponse(
            choices=[
                _FakeChoice(
                    message=_FakeMessage(
                        content=json.dumps(
                            {
                                "holdings_review": [
                                    {
                                        "symbol": "AAPL",
                                        "stance": "hold",
                                        "confidence": 0.61,
                                        "reason": "Stable earnings quality.",
                                    }
                                ],
                                "sector_outlook": [
                                    {
                                        "sector": "Technology",
                                        "ticker": "XLK",
                                        "momentum": "strong",
                                        "summary": "Leadership remains broad.",
                                    }
                                ],
                                "stock_ideas": [
                                    {
                                        "symbol": "NVDA",
                                        "sector": "Technology",
                                        "thesis": "AI demand remains resilient.",
                                        "risk": "Valuation volatility.",
                                        "entry_style": "pullback",
                                        "confidence": 0.68,
                                    }
                                ],
                                "top_3_buys": [
                                    {
                                        "symbol": "NVDA",
                                        "sector": "Technology",
                                        "thesis": "AI demand remains resilient.",
                                        "risk": "Valuation volatility.",
                                        "entry_style": "pullback",
                                        "confidence": 0.68,
                                    }
                                ],
                                "do_not_buy": [
                                    {
                                        "symbol": "XYZ",
                                        "sector": "Utilities",
                                        "reason": "Weak balance sheet trajectory.",
                                        "confidence": 0.72,
                                    }
                                ],
                                "macro_summary": "Risk appetite is constructive.",
                            }
                        )
                    )
                )
            ]
        )


class _FakeResearchChat:
    def __init__(self) -> None:
        self.completions = _FakeResearchCompletions()


class _FakeResearchOpenAIClient:
    def __init__(self) -> None:
        self.chat = _FakeResearchChat()


def test_generate_recommendations_falls_back_without_api_key(
    monkeypatch: Any,
) -> None:
    settings = Settings(AI_PROVIDER="openai", OPENAI_API_KEY="")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    output = service.generate_initial_recommendations(["spy"])
    assert len(output) == 1
    assert output[0].symbol == "SPY"
    assert output[0].action == "hold"


def test_generate_recommendations_uses_openai_and_tools(monkeypatch: Any) -> None:
    settings = Settings(
        AI_PROVIDER="openai",
        OPENAI_API_KEY="sk-test",
        AI_MODEL="gpt-4.2",
        SERPER_API_KEY="",
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    monkeypatch.setattr(
        service, "_create_openai_client", lambda api_key: _FakeOpenAIClient()
    )

    output = service.generate_initial_recommendations(["SPY"])
    assert len(output) == 1
    assert output[0].symbol == "SPY"
    assert output[0].action == "consider"
    assert output[0].confidence == 0.64


def test_generate_market_research_falls_back_without_api_key(monkeypatch: Any) -> None:
    settings = Settings(AI_PROVIDER="openai", OPENAI_API_KEY="")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    output = service.generate_market_research(["AAPL"], focus="technology")
    assert len(output.holdings_review) == 1
    assert output.holdings_review[0].symbol == "AAPL"
    assert output.holdings_review[0].stance == "watch"
    assert output.top_3_buys == []
    assert output.do_not_buy == []
    assert "missing" in output.macro_summary.lower()


def test_generate_market_research_uses_openai_and_tools(monkeypatch: Any) -> None:
    settings = Settings(
        AI_PROVIDER="openai",
        OPENAI_API_KEY="sk-test",
        AI_MODEL="gpt-4.2",
        SERPER_API_KEY="",
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    monkeypatch.setattr(
        service, "_create_openai_client", lambda api_key: _FakeResearchOpenAIClient()
    )

    output = service.generate_market_research(["AAPL"], focus="technology")
    assert len(output.holdings_review) == 1
    assert output.holdings_review[0].stance == "hold"
    assert len(output.stock_ideas) == 1
    assert output.stock_ideas[0].symbol == "NVDA"
    assert len(output.top_3_buys) == 1
    assert output.top_3_buys[0].symbol == "NVDA"
    assert len(output.do_not_buy) == 1
    assert output.do_not_buy[0].symbol == "XYZ"


def test_top_buys_guard_filters_do_not_buy_and_low_confidence() -> None:
    payload = json.dumps(
        {
            "holdings_review": [],
            "sector_outlook": [],
            "stock_ideas": [
                {
                    "symbol": "ABC",
                    "sector": "Technology",
                    "thesis": "Strong setup.",
                    "risk": "Volatility.",
                    "entry_style": "pullback",
                    "confidence": 0.9,
                },
                {
                    "symbol": "DEF",
                    "sector": "Industrials",
                    "thesis": "Recovering demand.",
                    "risk": "Cyclical risk.",
                    "entry_style": "watchlist",
                    "confidence": 0.75,
                },
                {
                    "symbol": "LOW",
                    "sector": "Utilities",
                    "thesis": "Potential reversal.",
                    "risk": "Weak relative strength.",
                    "entry_style": "watchlist",
                    "confidence": 0.45,
                },
            ],
            "top_3_buys": [
                {
                    "symbol": "ABC",
                    "sector": "Technology",
                    "thesis": "Strong setup.",
                    "risk": "Volatility.",
                    "entry_style": "pullback",
                    "confidence": 0.9,
                },
                {
                    "symbol": "LOW",
                    "sector": "Utilities",
                    "thesis": "Potential reversal.",
                    "risk": "Weak relative strength.",
                    "entry_style": "watchlist",
                    "confidence": 0.45,
                },
            ],
            "do_not_buy": [
                {
                    "symbol": "ABC",
                    "sector": "Technology",
                    "reason": "Accounting risk.",
                    "confidence": 0.8,
                }
            ],
            "macro_summary": "Mixed backdrop.",
        }
    )

    output = service._extract_market_research_from_model_output(
        model_output=payload,
        holdings=[],
        min_buy_confidence=0.6,
        generated_at=service.datetime.now(service.timezone.utc),
    )

    assert len(output.top_3_buys) == 1
    assert output.top_3_buys[0].symbol == "DEF"
