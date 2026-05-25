"""Request/response models for batch holdings price refresh via web search."""

from pydantic import BaseModel, Field


class HoldingsIntradayRequest(BaseModel):
    symbols: list[str] = Field(
        min_length=1,
        max_length=20,
        description="US equity tickers to refresh (deduplicated server-side).",
    )


class HoldingsIntradayQuote(BaseModel):
    symbol: str
    price: float
    previous_close: float
    source: str


class HoldingsIntradayResponse(BaseModel):
    quotes: list[HoldingsIntradayQuote]
