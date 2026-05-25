/**
 * Client for the Python AI briefing endpoints.
 * All functions throw on non-2xx responses.
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

/**
 * Fetches the most recently persisted morning briefing from the API.
 * @returns {Promise<object>} Raw briefing JSON from the server.
 */
export async function fetchLatestMorningBriefing() {
  const response = await fetch(`${apiBaseUrl()}/briefings/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch morning briefing (${response.status})`);
  }
  return response.json();
}

/**
 * Requests a fresh morning briefing from the AI pipeline.
 *
 * @param {object} [params]
 * @param {string[]} [params.holdings] - Ticker symbols currently held.
 * @param {Array<{ symbol: string, name: string, sector: string, shares: number, price: number }>} [params.holdingsSnapshot]
 * @param {number} [params.cashAvailable]
 * @param {number} [params.strategyGrowthPct] - Growth allocation 0–100.
 * @param {number} [params.strategyFixedPct] - Fixed-income allocation 0–100.
 * @param {string} [params.focus] - Optional free-text focus directive for the agent.
 * @param {boolean} [params.persist] - Whether to save the briefing on the server.
 * @param {string} [params.tradingMode] - Active trading mode ID.
 * @returns {Promise<object>} Briefing JSON including execution recommendations.
 */
export async function generateMorningBriefing({
  holdings = [],
  holdingsSnapshot = [],
  cashAvailable = 0,
  strategyGrowthPct = 60,
  strategyFixedPct = 40,
  focus = "",
  persist = false,
  tradingMode = "manual_user",
} = {}) {
  const normalizedHoldings = Array.from(
    new Set(
      (holdings || [])
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const response = await fetch(`${apiBaseUrl()}/briefings/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      holdings: normalizedHoldings,
      holdings_snapshot: (holdingsSnapshot || []).map((item) => ({
        symbol: String(item?.symbol || "").trim().toUpperCase(),
        name: String(item?.name || ""),
        sector: String(item?.sector || ""),
        shares: Math.max(0, Number(item?.shares) || 0),
        price: Math.max(0, Number(item?.price) || 0),
      })),
      cash_available: Math.max(0, Number(cashAvailable) || 0),
      strategy_growth_pct: Math.max(0, Math.min(100, Number(strategyGrowthPct) || 0)),
      strategy_fixed_pct: Math.max(0, Math.min(100, Number(strategyFixedPct) || 0)),
      focus: String(focus || ""),
      persist: Boolean(persist),
      trading_mode: String(tradingMode || "manual_user"),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate morning briefing (${response.status})`);
  }
  return response.json();
}
