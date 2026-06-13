"""Tests for market-data providers, factory, and quote cache."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.services.market_data.base import ProviderError
from app.services.market_data.factory import (
    fetch_quote_sync,
    get_market_data_provider_for_settings,
    market_data_status,
    reset_market_data_provider_cache,
)
from app.services.market_data.mock_provider import MOCK_QUOTES, MockMarketDataProvider
from app.services.market_data.polygon_provider import PolygonMarketDataProvider
from app.services.market_data.quote_cache import clear_quote_cache


@pytest.fixture(autouse=True)
def reset_caches():
    clear_quote_cache()
    reset_market_data_provider_cache()
    yield
    clear_quote_cache()
    reset_market_data_provider_cache()


def test_mock_provider_returns_deterministic_quotes():
    provider = MockMarketDataProvider()
    quote = asyncio.run(provider.get_quote("AAPL"))
    assert quote.symbol == "AAPL"
    assert quote.price == MOCK_QUOTES["AAPL"]
    assert quote.is_delayed is True
    assert quote.provider == "mock_demo"


def test_mock_provider_batch_quotes():
    provider = MockMarketDataProvider()
    quotes = asyncio.run(provider.get_quotes(["NVDA", "MSFT"]))
    assert len(quotes) == 2
    assert {q.symbol for q in quotes} == {"NVDA", "MSFT"}


def test_factory_selects_mock_provider():
    settings = Settings(MARKET_DATA_PROVIDER="mock")
    provider = get_market_data_provider_for_settings(settings)
    assert isinstance(provider, MockMarketDataProvider)


def test_factory_selects_polygon_provider():
    settings = Settings(MARKET_DATA_PROVIDER="polygon", POLYGON_API_KEY="poly-test")
    provider = get_market_data_provider_for_settings(settings)
    assert isinstance(provider, PolygonMarketDataProvider)


def test_factory_unknown_provider_raises():
    settings = Settings(MARKET_DATA_PROVIDER="unknown")
    with pytest.raises(ValueError, match="Unsupported"):
        get_market_data_provider_for_settings(settings)


def test_market_data_status_includes_ui_label():
    settings = Settings(MARKET_DATA_PROVIDER="mock")
    status = market_data_status(settings)
    assert status["market_data_provider"] == "mock"
    assert status["market_data_ui_label"] == "Mock demo data"
    assert status["paper_trading_only"] is True


def test_polygon_provider_uses_prev_close():
    settings = Settings(
        MARKET_DATA_PROVIDER="polygon",
        POLYGON_API_KEY="poly-test",
        MARKET_DATA_CACHE_MINUTES=15,
    )
    provider = PolygonMarketDataProvider(settings)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": [{"c": 175.5}]}
    mock_resp.raise_for_status.return_value = None
    with patch("app.services.market_data.polygon_provider.httpx.get", return_value=mock_resp):
        quote = asyncio.run(provider.get_quote("AAPL"))
    assert quote.price == 175.5
    assert quote.data_quality == "previous_close"
    assert quote.provider == "polygon_prev_close"


def test_polygon_provider_missing_key_raises():
    settings = Settings(MARKET_DATA_PROVIDER="polygon", POLYGON_API_KEY="")
    provider = PolygonMarketDataProvider(settings)
    with pytest.raises(ProviderError):
        asyncio.run(provider.get_quote("AAPL"))


def test_fetch_quote_sync_uses_mock_provider():
    settings = Settings(MARKET_DATA_PROVIDER="mock")
    quote = fetch_quote_sync("MSFT", settings)
    assert quote.symbol == "MSFT"
    assert quote.price == MOCK_QUOTES["MSFT"]


def test_polygon_provider_cache_hit():
    settings = Settings(
        MARKET_DATA_PROVIDER="polygon",
        POLYGON_API_KEY="poly-test",
        MARKET_DATA_CACHE_MINUTES=15,
    )
    provider = PolygonMarketDataProvider(settings)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": [{"c": 200.0}]}
    mock_resp.raise_for_status.return_value = None

    with patch("app.services.market_data.polygon_provider.httpx.get", return_value=mock_resp) as get_mock:
        first = asyncio.run(provider.get_quote("GOOG"))
        second = asyncio.run(provider.get_quote("GOOG"))

    assert first.price == 200.0
    assert second.cache_hit is True
    assert get_mock.call_count == 1
