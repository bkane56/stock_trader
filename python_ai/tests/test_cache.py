"""Tests for TTL cache behavior."""

from app.services.cache import TtlCache


def test_cache_hit_and_miss():
    cache = TtlCache[str](60)
    assert cache.get("a") is None
    cache.set("a", "value")
    assert cache.get("a") == "value"


def test_cache_clear():
    cache = TtlCache[str](60)
    cache.set("a", "value")
    cache.clear()
    assert cache.get("a") is None
