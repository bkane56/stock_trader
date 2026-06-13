"""Tests for FastAPI route handlers using TestClient with mocked dependencies."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402 — must come after sys.path


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# /health/details
# ---------------------------------------------------------------------------


def test_health_details(client: TestClient) -> None:
    mock_details = {"provider": "openai", "model": "gpt-4o", "last_run": None}
    with patch("app.api.routes.runtime_health_details", return_value=mock_details):
        response = client.get("/health/details")
    assert response.status_code == 200
    assert response.json()["provider"] == "openai"


# ---------------------------------------------------------------------------
# /pipeline/runs/latest
# ---------------------------------------------------------------------------


def test_pipeline_latest_run(client: TestClient) -> None:
    mock_summary = {"run_id": "abc", "status": "ok", "steps": 3}
    with patch("app.api.routes.latest_pipeline_run_summary", return_value=mock_summary):
        response = client.get("/pipeline/runs/latest")
    assert response.status_code == 200
    assert response.json()["run_id"] == "abc"


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def test_parse_symbols_csv_basic() -> None:
    from app.api.routes import _parse_symbols_csv

    assert _parse_symbols_csv("AAPL,MSFT, GOOG") == ["AAPL", "MSFT", "GOOG"]


def test_parse_symbols_csv_empty_parts() -> None:
    from app.api.routes import _parse_symbols_csv

    assert _parse_symbols_csv("AAPL,,MSFT") == ["AAPL", "MSFT"]


def test_is_autonomous_mode_true() -> None:
    from app.api.routes import _is_autonomous_mode

    assert _is_autonomous_mode("autonomous_agent") is True


def test_is_autonomous_mode_false() -> None:
    from app.api.routes import _is_autonomous_mode

    assert _is_autonomous_mode("manual_user") is False


# ---------------------------------------------------------------------------
# /quotes/{symbol} — provider-backed quotes
# ---------------------------------------------------------------------------


def test_get_quote_success(client: TestClient) -> None:
    payload = {
        "symbol": "AAPL",
        "name": "AAPL",
        "price": 175.0,
        "previous_close": 175.0,
        "currency": "USD",
        "source": "mock_demo",
        "provider": "mock_demo",
        "data_quality": "mock_demo",
        "is_delayed": True,
        "cache_hit": False,
    }
    with patch("app.api.routes._fetch_quote", return_value=payload):
        response = client.get("/quotes/AAPL")
    assert response.status_code == 200
    assert response.json()["price"] == 175.0


def test_market_data_status_endpoint(client: TestClient) -> None:
    mock_status = {
        "market_data_provider": "mock",
        "market_data_ui_label": "Mock demo data",
        "paper_trading_only": True,
    }
    with patch("app.api.routes.market_data_status", return_value=mock_status):
        response = client.get("/market-data/status")
    assert response.status_code == 200
    assert response.json()["market_data_provider"] == "mock"


# ---------------------------------------------------------------------------
# _fetch_quote internal helper
# ---------------------------------------------------------------------------


def test_fetch_quote_provider_error_raises():
    from app.api.routes import _fetch_quote
    from app.services.market_data.base import ProviderError

    with patch(
        "app.api.routes.fetch_quote_sync",
        side_effect=ProviderError("AAPL", "mock_demo", "missing credentials"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            _fetch_quote("AAPL")
    assert exc_info.value.status_code == 503


def test_fetch_quote_empty_symbol_raises():
    from app.api.routes import _fetch_quote

    with pytest.raises(HTTPException) as exc_info:
        _fetch_quote("   ")
    assert exc_info.value.status_code == 400


def test_post_holdings_intraday(client: TestClient) -> None:
    mock_rows = [
        {"symbol": "AAPL", "price": 175.0, "previous_close": 173.0, "source": "web"}
    ]
    with patch(
        "app.api.routes.fetch_holdings_prices_via_web_search", return_value=mock_rows
    ):
        response = client.post(
            "/quotes/holdings/intraday", json={"symbols": ["AAPL"]}
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data["quotes"]) == 1
    assert data["quotes"][0]["symbol"] == "AAPL"
