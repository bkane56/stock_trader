const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

export async function fetchLatestMorningBriefing() {
  const response = await fetch(`${apiBaseUrl()}/briefings/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch morning briefing (${response.status})`);
  }
  return response.json();
}

export async function generateMorningBriefing({
  holdings = [],
  holdingsSnapshot = [],
  cashAvailable = 0,
  strategyGrowthPct = 60,
  strategyFixedPct = 40,
  focus = "",
  persist = false,
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
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate morning briefing (${response.status})`);
  }
  return response.json();
}
