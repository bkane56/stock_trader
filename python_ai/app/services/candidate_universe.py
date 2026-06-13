"""Build the deterministic candidate symbol universe before AI review."""

from app.core.config import Settings, get_settings
from app.pipeline.briefing_logic import normalize_symbols

CORE_UNIVERSE = [
    "SPY",
    "QQQ",
    "DIA",
    "IWM",
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "SPCX",
    "AVGO",
    "AMD",
    "ORCL",
    "CRM",
    "NOW",
    "JPM",
    "V",
    "MA",
    "COST",
    "WMT",
    "LLY",
    "UNH",
    "XOM",
    "CAT",
    "GE",
]


def _parse_extra_symbols(raw: str) -> list[str]:
    """Parse comma-separated extra tickers from settings."""
    if not raw.strip():
        return []
    return normalize_symbols(raw.split(","))


def build_candidate_universe(
    *,
    holdings: list[str],
    recently_recommended: list[str] | None = None,
    settings: Settings | None = None,
) -> list[str]:
    """Return deduplicated symbols: holdings first, then extras, recents, core universe."""
    cfg = settings or get_settings()
    holdings_norm = normalize_symbols(holdings)
    recents = normalize_symbols(recently_recommended or [])
    extras = _parse_extra_symbols(cfg.CANDIDATE_UNIVERSE_EXTRA)
    core = normalize_symbols(CORE_UNIVERSE)

    ordered: list[str] = []
    seen: set[str] = set()
    for group in (holdings_norm, extras, recents, core):
        for symbol in group:
            if symbol not in seen:
                seen.add(symbol)
                ordered.append(symbol)
    return ordered
