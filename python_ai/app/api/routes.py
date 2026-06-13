"""FastAPI route definitions for the AI recommendation service.

All endpoints are mounted under the prefix configured in ``main.py``.
"""

from typing import Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import get_settings
from app.core.market_hours import (
    US_EQUITY_MARKET_HOURS_LABEL,
    is_us_equity_trading_hours_eastern,
)
from app.pipeline.holdings_intraday import fetch_holdings_prices_via_web_search
from app.pipeline.service import (
    generate_and_persist_morning_briefing,
    generate_morning_briefing,
    generate_market_research,
    generate_initial_recommendations,
    latest_persisted_morning_briefing,
    latest_recommendation_tools_used,
    latest_pipeline_run_summary,
    runtime_health_details,
)
from app.schemas.holdings_quotes import (
    HoldingsIntradayQuote,
    HoldingsIntradayRequest,
    HoldingsIntradayResponse,
)
from app.schemas.decision_ledger import DecisionLedgerEntry
from app.schemas.recommendations import (
    MarketResearchResponse,
    MorningBriefingGenerateRequest,
    MorningBriefingResponse,
    RecommendationListResponse,
)
from app.services.decision_ledger import list_decisions
from app.services.market_data.base import ProviderError, quote_to_api_dict
from app.services.market_data.factory import (
    fetch_quote_sync,
    market_data_status,
)

router = APIRouter()
_TRADING_MODE_PATTERN = "^(manual_user|assisted_agent|autonomous_agent)$"


def _parse_symbols_csv(raw: str) -> list[str]:
    """Split a comma-separated ticker string into a list of non-empty symbols."""
    return [symbol.strip() for symbol in raw.split(",") if symbol.strip()]


def _is_autonomous_mode(trading_mode: str) -> bool:
    """Return True when the caller has selected the autonomous agent trading mode."""
    return str(trading_mode).strip() == "autonomous_agent"


def _fetch_quote(symbol: str) -> dict[str, Any]:
    """Return a quote from the configured market-data provider."""
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="symbol is required",
        )

    try:
        quote = fetch_quote_sync(normalized_symbol)
    except ProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to fetch quote for {normalized_symbol}.",
        ) from exc

    return quote_to_api_dict(quote)


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe — returns ``{"status": "ok"}`` when the service is up."""
    return {"status": "ok"}


@router.get("/health/details")
def health_details() -> dict[str, Any]:
    """Readiness probe with provider, model, and last-run metadata."""
    details = runtime_health_details()
    details.update(market_data_status())
    return details


@router.get("/market-data/status")
def get_market_data_status() -> dict[str, str | bool]:
    """Return configured market-data provider and UI disclaimer metadata."""
    return market_data_status()


@router.get("/pipeline/runs/latest")
def get_latest_pipeline_run() -> dict[str, str | int]:
    """Return a summary of the most recent pipeline execution."""
    return latest_pipeline_run_summary()


@router.get("/recommendations", response_model=RecommendationListResponse)
def get_recommendations(
    watchlist: str = Query(default="SPY,QQQ"),
    trading_mode: str = Query(
        default="manual_user",
        pattern=_TRADING_MODE_PATTERN,
        description=(
            "When autonomous_agent, day-trader system prompts are used for the "
            "advisor and research agents."
        ),
    ),
) -> RecommendationListResponse:
    """Generate AI stock recommendations for the given watchlist."""
    symbols = _parse_symbols_csv(watchlist)
    autonomous_mode = _is_autonomous_mode(trading_mode)
    recommendations = generate_initial_recommendations(
        symbols=symbols,
        autonomous_mode=autonomous_mode,
    )
    return RecommendationListResponse(
        recommendations=recommendations,
        tools_used=latest_recommendation_tools_used(),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/quotes/{symbol}")
def get_quote(
    symbol: str,
    price_mode: str = Query(
        default="live",
        pattern="^(live|previous_close)$",
        description=(
            "Quote mode is accepted for API compatibility. "
            "Pricing comes from the configured MARKET_DATA_PROVIDER."
        ),
    ),
) -> dict[str, Any]:
    """Return a quote for *symbol* from the configured market-data provider."""
    _ = price_mode
    return _fetch_quote(symbol)


@router.post("/quotes/holdings/intraday", response_model=HoldingsIntradayResponse)
def post_holdings_intraday_prices(payload: HoldingsIntradayRequest) -> HoldingsIntradayResponse:
    """Fetch batch quotes for holdings via the configured market-data provider."""
    rows = fetch_holdings_prices_via_web_search(list(payload.symbols))
    quotes = [HoldingsIntradayQuote(**row) for row in rows]
    return HoldingsIntradayResponse(quotes=quotes)


@router.get("/research", response_model=MarketResearchResponse)
def get_market_research(
    holdings: str = Query(default="SPY,QQQ,AAPL"),
    focus: str = Query(default=""),
    trading_mode: str = Query(
        default="manual_user",
        pattern=_TRADING_MODE_PATTERN,
        description=(
            "When autonomous_agent, day-trader system prompts are used for the research agent."
        ),
    ),
) -> MarketResearchResponse:
    """Run the AI research agent and return sector/holding analysis."""
    symbols = _parse_symbols_csv(holdings)
    autonomous_mode = _is_autonomous_mode(trading_mode)
    return generate_market_research(
        holdings=symbols,
        focus=focus,
        autonomous_mode=autonomous_mode,
    )


@router.get("/briefings/latest", response_model=MorningBriefingResponse)
def get_latest_morning_briefing() -> MorningBriefingResponse:
    """Return the most recently persisted morning briefing, or generate a default one."""
    settings = get_settings()
    default_symbols = _parse_symbols_csv(settings.MORNING_BRIEFING_DEFAULT_HOLDINGS)
    latest = latest_persisted_morning_briefing()
    if latest is not None:
        return latest
    return generate_morning_briefing(
        holdings=default_symbols,
        holdings_snapshot=[],
        cash_available=max(0.0, settings.MORNING_BRIEFING_DEFAULT_CASH),
        strategy_growth_pct=60.0,
        strategy_fixed_pct=40.0,
        focus="general stock market and world news",
        trading_mode="manual_user",
    )


@router.post("/briefings/generate", response_model=MorningBriefingResponse)
def generate_morning_briefing_endpoint(
    payload: MorningBriefingGenerateRequest,
) -> MorningBriefingResponse:
    """Generate a full morning briefing from the caller's portfolio snapshot.

    Blocks autonomous-mode calls outside US equity market hours.
    Set ``persist=true`` to write the result to disk for ``/briefings/latest``.
    """
    if (
        payload.trading_mode == "autonomous_agent"
        and not is_us_equity_trading_hours_eastern()
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Autonomous mode is restricted to US market hours "
                f"({US_EQUITY_MARKET_HOURS_LABEL})."
            ),
        )
    if payload.persist:
        return generate_and_persist_morning_briefing(
            holdings=payload.holdings,
            holdings_snapshot=payload.holdings_snapshot,
            cash_available=payload.cash_available,
            strategy_growth_pct=payload.strategy_growth_pct,
            strategy_fixed_pct=payload.strategy_fixed_pct,
            focus=payload.focus,
            trading_mode=payload.trading_mode,
            force_refresh=payload.force_refresh,
        )
    return generate_morning_briefing(
        holdings=payload.holdings,
        holdings_snapshot=payload.holdings_snapshot,
        cash_available=payload.cash_available,
        strategy_growth_pct=payload.strategy_growth_pct,
        strategy_fixed_pct=payload.strategy_fixed_pct,
        focus=payload.focus,
        trading_mode=payload.trading_mode,
        force_refresh=payload.force_refresh,
    )


@router.get("/decision-ledger", response_model=list[DecisionLedgerEntry])
def get_decision_ledger(
    limit: int = Query(default=100, ge=1, le=500),
) -> list[DecisionLedgerEntry]:
    """Return recent auditable recommendation and execution decisions."""
    return list_decisions(limit=limit)


@router.get("/decision-ledger/latest", response_model=list[DecisionLedgerEntry])
def get_latest_decision_ledger(
    limit: int = Query(default=20, ge=1, le=100),
) -> list[DecisionLedgerEntry]:
    """Return the most recent decision ledger entries."""
    return list_decisions(limit=limit)
