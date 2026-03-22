const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";
const QUOTE_CLOSE_CACHE_PREFIX = "investai.quoteClose";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

function todayCacheStamp() {
  return new Date().toISOString().slice(0, 10);
}

function quoteCloseCacheKey(symbol) {
  return `${QUOTE_CLOSE_CACHE_PREFIX}.${String(symbol || "").toUpperCase()}.${todayCacheStamp()}`;
}

function readCachedClose(symbol) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(quoteCloseCacheKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const value = Number(parsed?.previous_close);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      symbol: String(parsed?.symbol || symbol || "").toUpperCase(),
      name: String(parsed?.name || "").trim(),
      previous_close: value,
      price: value,
      source: "previous_close_cache",
    };
  } catch (_error) {
    return null;
  }
}

function writeCachedClose(quote) {
  if (typeof window === "undefined") return;
  const symbol = String(quote?.symbol || "").trim().toUpperCase();
  const previousClose = Number(quote?.previous_close) || Number(quote?.price) || 0;
  if (!symbol || previousClose <= 0) return;
  try {
    window.localStorage.setItem(
      quoteCloseCacheKey(symbol),
      JSON.stringify({
        symbol,
        name: String(quote?.name || "").trim(),
        previous_close: previousClose,
      })
    );
  } catch (_error) {
    // Ignore cache write failures.
  }
}

export async function fetchSymbolQuote(symbol, options = {}) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Symbol is required.");
  }
  const pricingProfile = String(options?.pricingProfile || "live").toLowerCase();

  if (pricingProfile === "basic") {
    const cached = readCachedClose(normalized);
    if (cached) {
      return cached;
    }
  }

  const response = await fetch(`${apiBaseUrl()}/quotes/${encodeURIComponent(normalized)}`);
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.detail || "").trim();
    } catch (_error) {
      detail = "";
    }
    throw new Error(
      detail || `Unable to fetch quote for ${normalized} (${response.status}).`
    );
  }
  const quote = await response.json();
  writeCachedClose(quote);

  if (pricingProfile === "basic") {
    const previousClose = Number(quote?.previous_close) || Number(quote?.price) || 0;
    return {
      ...quote,
      symbol: String(quote?.symbol || normalized).toUpperCase(),
      previous_close: previousClose,
      price: previousClose,
      source: "previous_close_cached_live",
    };
  }

  return quote;
}
