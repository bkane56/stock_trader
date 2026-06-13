"""Market data provider interface and quote model."""

from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel


class MarketQuote(BaseModel):
    """Normalized quote with provider and freshness metadata."""

    symbol: str
    price: float
    as_of: datetime
    provider: str
    data_quality: str
    is_delayed: bool
    notes: str | None = None
    previous_close: float | None = None
    cache_hit: bool = False


class MarketDataProvider(ABC):
    """Abstract quote provider for paper-trading simulation."""

    @abstractmethod
    async def get_quote(self, symbol: str) -> MarketQuote:
        """Return a quote for one symbol."""

    @abstractmethod
    async def get_quotes(self, symbols: list[str]) -> list[MarketQuote]:
        """Return quotes for many symbols (best-effort per symbol)."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Short provider identifier (alpaca, polygon, mock)."""

    @property
    @abstractmethod
    def ui_label(self) -> str:
        """Human-readable label for UI disclaimers."""

    def source_key(self) -> str:
        """Legacy API `source` field value."""
        return self.provider_id


class ProviderError(Exception):
    """Raised when a provider cannot return a quote."""

    def __init__(self, symbol: str, provider: str, message: str) -> None:
        self.symbol = symbol
        self.provider = provider
        super().__init__(message)


def normalize_symbol(symbol: str) -> str:
    """Normalize ticker to uppercase."""
    return symbol.strip().upper()


def quote_to_api_dict(quote: MarketQuote) -> dict[str, object]:
    """Map a MarketQuote to the legacy REST quote payload."""
    prev = quote.previous_close if quote.previous_close is not None else quote.price
    return {
        "symbol": quote.symbol,
        "name": quote.symbol,
        "price": quote.price,
        "previous_close": prev,
        "currency": "USD",
        "source": quote.provider,
        "provider": quote.provider,
        "as_of": quote.as_of.isoformat(),
        "is_delayed": quote.is_delayed,
        "data_quality": quote.data_quality,
        "cache_hit": quote.cache_hit,
        "notes": quote.notes,
    }
