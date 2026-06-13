/**
 * Client for the decision ledger API.
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";

function apiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

/** Fetch recent decision ledger entries from the backend. */
export async function fetchDecisionLedger({ limit = 100 } = {}) {
  const response = await fetch(`${apiBaseUrl()}/decision-ledger?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch decision ledger (${response.status})`);
  }
  return response.json();
}
