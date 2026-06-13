/**
 * Client for the Python AI market-data endpoints (quotes, batch holdings refresh).
 * Includes a localStorage cache for previous-close prices to avoid redundant requests.
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";
const QUOTE_CLOSE_CACHE_PREFIX = "investai.quoteClose";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

/** Returns the base URL for the Python AI API (used by quotes, briefings, holdings refresh). */
export function getPythonAiBaseUrl() {
  return apiBaseUrl();
}

/** Max ms to wait for an intraday batch quote before aborting (prevents stuck loading states). */
const HOLDINGS_INTRADAY_FETCH_MS = 35000;

/**
 * Batch-fetches quotes for holdings using the configured backend market-data provider.
 *
 * @param {string[]} symbols - Uppercase ticker symbols to refresh.
 * @returns {Promise<Array<{ symbol: string, price: number, previous_close: number, source: string, provider?: string, data_quality?: string, is_delayed?: boolean }>>}
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

/** Returns a date string (YYYY-MM-DD) representing today, used as a cache key suffix. */
function todayCacheStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Builds the localStorage key for a given symbol's cached previous-close price. */
function quoteCloseCacheKey(symbol) {
  return `${QUOTE_CLOSE_CACHE_PREFIX}.${String(symbol || "").toUpperCase()}.${todayCacheStamp()}`;
}

/**
 * Reads a cached previous-close quote for `symbol` from localStorage.
 * Returns `null` if no valid cache entry exists for today.
 * @param {string} symbol
 * @returns {{ symbol: string, name: string, previous_close: number, price: number, source: string } | null}
 */
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

/**
 * Writes the previous-close price from `quote` to localStorage for today's cache key.
 * Silently ignores failures (private mode, quota exceeded, etc.).
 * @param {{ symbol?: string, name?: string, previous_close?: number, price?: number }} quote
 */
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

/**
 * Fetches a real-time or previous-close quote for a single ticker.
 *
 * `pricingProfile` options:
 * - `"live"` (default): returns the current intraday price.
 * - `"basic"`: returns the previous-close price; first serves from localStorage cache.
 *
 * @param {string} symbol - Ticker symbol (case-insensitive).
 * @param {{ pricingProfile?: "live" | "basic", priceMode?: "live" | "previous_close" }} [options]
 * @returns {Promise<{ symbol: string, name: string, price: number, previous_close: number, source?: string }>}
 */
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
