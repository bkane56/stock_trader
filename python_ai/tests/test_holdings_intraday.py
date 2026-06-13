"""Tests for batch holdings quote refresh via market-data providers."""

from unittest.mock import patch

from datetime import datetime, timezone

from app.pipeline.holdings_intraday import fetch_holdings_prices_via_web_search
from app.services.market_data.base import MarketQuote


def _sample_quote(symbol: str, price: float) -> MarketQuote:
    now = datetime.now(timezone.utc)
    return MarketQuote(
        symbol=symbol,
        price=price,
        previous_close=price,
        as_of=now,
        provider="mock_demo",
        data_quality="mock_demo",
        is_delayed=True,
    )


def test_fetch_holdings_prices_empty_symbols():
    assert fetch_holdings_prices_via_web_search([]) == []


def test_fetch_holdings_prices_uses_provider():
    quotes = [_sample_quote("AAPL", 195.0), _sample_quote("MSFT", 430.0)]
    with patch(
        "app.pipeline.holdings_intraday.fetch_quotes_sync",
        return_value=quotes,
    ):
        rows = fetch_holdings_prices_via_web_search(["AAPL", "MSFT"])
    assert len(rows) == 2
    assert rows[0]["symbol"] == "AAPL"
    assert rows[0]["price"] == 195.0
    assert rows[0]["provider"] == "mock_demo"


def test_fetch_holdings_prices_deduplicates_and_caps():
    quotes = [_sample_quote("AAPL", 195.0)]
    with patch("app.pipeline.holdings_intraday.fetch_quotes_sync", return_value=quotes):
        rows = fetch_holdings_prices_via_web_search(["aapl", "AAPL", ""])
    assert len(rows) == 1
