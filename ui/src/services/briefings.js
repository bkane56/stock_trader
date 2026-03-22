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
  cashAvailable = 0,
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
      cash_available: Math.max(0, Number(cashAvailable) || 0),
      focus: String(focus || ""),
      persist: Boolean(persist),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to generate morning briefing (${response.status})`);
  }
  return response.json();
}
