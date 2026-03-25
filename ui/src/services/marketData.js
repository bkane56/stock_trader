const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";
const QUOTE_CLOSE_CACHE_PREFIX = "investai.quoteClose";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

/** Base URL for the Python AI API (used by quotes, briefings, holdings refresh). */
export function getPythonAiBaseUrl() {
  return apiBaseUrl();
}

/** Max time to wait for web-search batch pricing before falling back (avoids stuck "Loading briefing…"). */
const HOLDINGS_INTRADAY_FETCH_MS = 35000;

/**
 * Batch refresh: Serper web search + LLM extraction for current marks (Polygon is EOD-only on many tiers).
 * @param {string[]} symbols
 * @returns {Promise<Array<{ symbol: string, price: number, previous_close: number, source: string }>>}
 */
export async function fetchHoldingsIntradayQuotes(symbols) {
  const uniq = [
    ...new Set(
      (symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean),
    ),
  ];
  if (!uniq.length) return [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOLDINGS_INTRADAY_FETCH_MS);
  let response;
  try {
    response = await fetch(`${getPythonAiBaseUrl()}/quotes/holdings/intraday`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: uniq }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.detail || "").trim();
    } catch (_error) {
      detail = "";
    }
    throw new Error(detail || `Unable to refresh holdings quotes (${response.status}).`);
  }
  const data = await response.json();
  return Array.isArray(data.quotes) ? data.quotes : [];
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
  let priceMode = String(options?.priceMode || "live").toLowerCase();
  if (pricingProfile === "basic" && options?.priceMode === undefined) {
    priceMode = "previous_close";
  }
  const priceModeParam = priceMode === "previous_close" ? "previous_close" : "live";
  const quoteUrl = `${apiBaseUrl()}/quotes/${encodeURIComponent(normalized)}?price_mode=${encodeURIComponent(
    priceModeParam,
  )}`;

  if (pricingProfile === "basic") {
    const cached = readCachedClose(normalized);
    if (cached) {
      return cached;
    }
  }

  const response = await fetch(quoteUrl);
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
