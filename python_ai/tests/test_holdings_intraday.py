"""Tests for batch holdings intraday endpoint (web search path mocked)."""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app

client = TestClient(app)


def test_post_holdings_intraday_returns_quotes(monkeypatch) -> None:
    from app.api import routes as api_routes

    def _fake_fetch(symbols: list[str]) -> list[dict]:
        return [
            {
                "symbol": "AAPL",
                "price": 180.0,
                "previous_close": 179.0,
                "source": "web_search_llm",
            }
        ]

    monkeypatch.setattr(api_routes, "fetch_holdings_prices_via_web_search", _fake_fetch)
    response = client.post("/quotes/holdings/intraday", json={"symbols": ["AAPL"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["quotes"][0]["symbol"] == "AAPL"
    assert payload["quotes"][0]["price"] == 180.0
    assert payload["quotes"][0]["source"] == "web_search_llm"


def test_post_holdings_intraday_validation_empty_symbols() -> None:
    response = client.post("/quotes/holdings/intraday", json={"symbols": []})
    assert response.status_code == 422
