"""Tests for holdings_intraday helper functions."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

import httpx

from app.pipeline.holdings_intraday import (
    _polygon_prev_close_cached,
    _polygon_prev_close_http,
    _quotes_polygon_only,
    fetch_holdings_prices_via_web_search,
)


# ---------------------------------------------------------------------------
# _polygon_prev_close_http
# ---------------------------------------------------------------------------


def _make_polygon_response(results: list) -> MagicMock:
    mock = MagicMock()
    mock.json.return_value = {"results": results}
    mock.raise_for_status.return_value = None
    return mock


def test_polygon_prev_close_http_success():
    mock_resp = _make_polygon_response([{"c": 175.5}])
    with patch("app.pipeline.holdings_intraday.httpx.get", return_value=mock_resp):
        result = _polygon_prev_close_http("AAPL", "fake-key")
    assert result == 175.5


def test_polygon_prev_close_http_empty_results():
    mock_resp = _make_polygon_response([])
    with patch("app.pipeline.holdings_intraday.httpx.get", return_value=mock_resp):
        result = _polygon_prev_close_http("AAPL", "fake-key")
    assert result is None


def test_polygon_prev_close_http_missing_close_field():
    mock_resp = _make_polygon_response([{"o": 174.0}])
    with patch("app.pipeline.holdings_intraday.httpx.get", return_value=mock_resp):
        result = _polygon_prev_close_http("AAPL", "fake-key")
    assert result is None


def test_polygon_prev_close_http_http_error():
    with patch(
        "app.pipeline.holdings_intraday.httpx.get",
        side_effect=httpx.HTTPError("connection failed"),
    ):
        result = _polygon_prev_close_http("AAPL", "fake-key")
    assert result is None


# ---------------------------------------------------------------------------
# _polygon_prev_close_cached
# ---------------------------------------------------------------------------


def test_polygon_prev_close_cached_hits_http_on_miss():
    import app.pipeline.holdings_intraday as mod

    mod._polygon_prev_cache.clear()
    mock_resp = _make_polygon_response([{"c": 200.0}])
    with patch("app.pipeline.holdings_intraday.httpx.get", return_value=mock_resp):
        result = _polygon_prev_close_cached("MSFT", "key")
    assert result == 200.0
    assert "MSFT" in mod._polygon_prev_cache


def test_polygon_prev_close_cached_returns_cached_value():
    import time

    import app.pipeline.holdings_intraday as mod

    # Pre-populate cache with a recent entry.
    mod._polygon_prev_cache["GOOG"] = (300.0, time.time())
    with patch("app.pipeline.holdings_intraday.httpx.get") as mock_get:
        result = _polygon_prev_close_cached("GOOG", "key")
    mock_get.assert_not_called()
    assert result == 300.0


# ---------------------------------------------------------------------------
# _quotes_polygon_only
# ---------------------------------------------------------------------------


def test_quotes_polygon_only_no_key():
    settings = MagicMock()
    settings.POLYGON_API_KEY = "   "  # empty after strip
    result = _quotes_polygon_only(["AAPL"], settings)
    assert result == []


def test_quotes_polygon_only_with_prev_close():
    settings = MagicMock()
    settings.POLYGON_API_KEY = "somekey"

    with patch(
        "app.pipeline.holdings_intraday._polygon_prev_close_cached", return_value=180.0
    ):
        result = _quotes_polygon_only(["AAPL"], settings)

    assert len(result) == 1
    assert result[0]["symbol"] == "AAPL"
    assert result[0]["price"] == 180.0
    assert result[0]["source"] == "polygon_prev_close"


# ---------------------------------------------------------------------------
# fetch_holdings_prices_via_web_search — early returns
# ---------------------------------------------------------------------------


def test_fetch_empty_symbols_returns_empty():
    result = fetch_holdings_prices_via_web_search([])
    assert result == []


def test_fetch_falls_back_to_polygon_when_keys_missing():
    mock_settings = MagicMock()
    mock_settings.POLYGON_API_KEY = ""
    mock_settings.SERPER_API_KEY = ""
    mock_settings.OPENAI_API_KEY = ""

    with patch("app.pipeline.holdings_intraday.get_settings", return_value=mock_settings):
        with patch(
            "app.pipeline.holdings_intraday._quotes_polygon_only", return_value=[]
        ) as mock_poly:
            result = fetch_holdings_prices_via_web_search(["AAPL"])

    mock_poly.assert_called_once()
    assert result == []
