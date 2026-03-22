const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

export async function fetchSymbolQuote(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Symbol is required.");
  }
  const response = await fetch(`${apiBaseUrl()}/quotes/${encodeURIComponent(normalized)}`);
  if (!response.ok) {
    throw new Error(`Unable to fetch quote for ${normalized} (${response.status}).`);
  }
  return response.json();
}
