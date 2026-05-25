"""Tests for FastAPI route handlers using TestClient with mocked dependencies."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import httpx
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
# /quotes/{symbol} — previous-close path (mocked polygon)
# ---------------------------------------------------------------------------


def test_get_quote_success(client: TestClient) -> None:
    payload = {
        "symbol": "AAPL",
        "name": "AAPL",
        "price": 175.0,
        "previous_close": 175.0,
        "currency": "USD",
        "source": "polygon_prev_close",
    }
    with patch("app.api.routes._fetch_quote_previous_close", return_value=payload):
        response = client.get("/quotes/AAPL")
    assert response.status_code == 200
    assert response.json()["price"] == 175.0


# ---------------------------------------------------------------------------
# /quotes/holdings/intraday
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# _polygon_prev_close internal helper
# ---------------------------------------------------------------------------


def test_polygon_prev_close_success():
    from app.api.routes import _polygon_prev_close

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": [{"c": 175.5}]}
    mock_resp.raise_for_status.return_value = None
    with patch("app.api.routes.httpx.get", return_value=mock_resp):
        result = _polygon_prev_close("AAPL", "key")
    assert result == 175.5


def test_polygon_prev_close_empty_results_raises():
    from app.api.routes import _polygon_prev_close

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": []}
    mock_resp.raise_for_status.return_value = None
    with patch("app.api.routes.httpx.get", return_value=mock_resp):
        with pytest.raises(HTTPException) as exc_info:
            _polygon_prev_close("AAPL", "key")
    assert exc_info.value.status_code == 503


def test_polygon_prev_close_non_numeric_close_raises():
    from app.api.routes import _polygon_prev_close

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": [{"c": None}]}
    mock_resp.raise_for_status.return_value = None
    with patch("app.api.routes.httpx.get", return_value=mock_resp):
        with pytest.raises(HTTPException) as exc_info:
            _polygon_prev_close("AAPL", "key")
    assert exc_info.value.status_code == 503


# ---------------------------------------------------------------------------
# _fetch_quote_previous_close internal helper
# ---------------------------------------------------------------------------


def test_fetch_quote_previous_close_no_api_key_raises():
    from app.api.routes import _fetch_quote_previous_close

    mock_settings = MagicMock()
    mock_settings.POLYGON_API_KEY = "   "
    with patch("app.api.routes.get_settings", return_value=mock_settings):
        with pytest.raises(HTTPException) as exc_info:
            _fetch_quote_previous_close("AAPL")
    assert exc_info.value.status_code == 503


def test_fetch_quote_previous_close_rate_limit_with_cache():
    from app.api import routes
    from app.api.routes import _fetch_quote_previous_close

    cached_payload = {
        "symbol": "AAPL",
        "name": "AAPL",
        "price": 170.0,
        "previous_close": 170.0,
        "currency": "USD",
        "source": "polygon_prev_close",
    }
    routes._QUOTE_CACHE["AAPL"] = cached_payload

    mock_settings = MagicMock()
    mock_settings.POLYGON_API_KEY = "somekey"

    rate_limit_resp = MagicMock()
    rate_limit_resp.status_code = 429
    exc = httpx.HTTPStatusError("rate limit", request=MagicMock(), response=rate_limit_resp)

    with patch("app.api.routes.get_settings", return_value=mock_settings):
        with patch("app.api.routes._polygon_prev_close", side_effect=exc):
            result = _fetch_quote_previous_close("AAPL")

    assert result["price"] == 170.0
    routes._QUOTE_CACHE.pop("AAPL", None)


def test_fetch_quote_previous_close_http_error_no_cache_raises():
    from app.api import routes
    from app.api.routes import _fetch_quote_previous_close

    routes._QUOTE_CACHE.pop("ZZZZZ", None)
    mock_settings = MagicMock()
    mock_settings.POLYGON_API_KEY = "somekey"

    with patch("app.api.routes.get_settings", return_value=mock_settings):
        with patch(
            "app.api.routes._polygon_prev_close",
            side_effect=httpx.HTTPError("connection error"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                _fetch_quote_previous_close("ZZZZZ")
    assert exc_info.value.status_code == 503


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
