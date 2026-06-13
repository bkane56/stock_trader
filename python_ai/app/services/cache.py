"""TTL cache for quotes, scores, research, and recommendations."""

import time
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    """Simple in-memory TTL cache."""

    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = max(1, int(ttl_seconds))
        self._store: dict[str, tuple[T, float]] = {}

    def get(self, key: str) -> T | None:
        """Return cached value if fresh."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, stored_at = entry
        if time.time() - stored_at > self._ttl:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: T) -> None:
        """Store value with current timestamp."""
        self._store[key] = (value, time.time())

    def clear(self) -> None:
        """Clear all entries."""
        self._store.clear()


_candidate_score_cache = TtlCache[Any](1800)
_research_summary_cache = TtlCache[Any](5400)
_recommendation_cache = TtlCache[Any](1800)


def candidate_score_cache(ttl_seconds: int | None = None) -> TtlCache[Any]:
    """Return shared candidate score cache."""
    global _candidate_score_cache
    if ttl_seconds is not None:
        _candidate_score_cache = TtlCache(ttl_seconds)
    return _candidate_score_cache


def research_summary_cache(ttl_seconds: int | None = None) -> TtlCache[Any]:
    """Return shared research summary cache."""
    global _research_summary_cache
    if ttl_seconds is not None:
        _research_summary_cache = TtlCache(ttl_seconds)
    return _research_summary_cache


def recommendation_cache(ttl_seconds: int | None = None) -> TtlCache[Any]:
    """Return shared recommendation cache."""
    global _recommendation_cache
    if ttl_seconds is not None:
        _recommendation_cache = TtlCache(ttl_seconds)
    return _recommendation_cache
