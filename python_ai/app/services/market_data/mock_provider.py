"""Deterministic mock quotes for tests and local demos."""

from datetime import datetime, timezone

from app.services.market_data.base import MarketDataProvider, MarketQuote, normalize_symbol

MOCK_QUOTES: dict[str, float] = {
    "NVDA": 125.00,
    "MSFT": 430.00,
    "AAPL": 195.00,
    "AMZN": 185.00,
    "GOOGL": 175.00,
    "SPY": 520.00,
    "QQQ": 450.00,
}


class MockMarketDataProvider(MarketDataProvider):
    """Returns fixed prices without external API calls."""

    @property
    def provider_id(self) -> str:
        return "mock_demo"

    @property
    def ui_label(self) -> str:
        return "Mock demo data"

    async def get_quote(self, symbol: str) -> MarketQuote:
        sym = normalize_symbol(symbol)
        if not sym:
            raise ValueError("symbol is required")
        price = MOCK_QUOTES.get(sym, 100.0)
        now = datetime.now(timezone.utc)
        return MarketQuote(
            symbol=sym,
            price=price,
            previous_close=price,
            as_of=now,
            provider=self.provider_id,
            data_quality="mock_demo",
            is_delayed=True,
            notes="Deterministic demo quote for paper trading.",
        )

    async def get_quotes(self, symbols: list[str]) -> list[MarketQuote]:
        out: list[MarketQuote] = []
        for symbol in symbols:
            sym = normalize_symbol(symbol)
            if sym:
                out.append(await self.get_quote(sym))
        return out
