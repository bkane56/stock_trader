/**
 * Client for the decision ledger API.
 */

import { fetchPythonAiJson } from "./apiClient";

/** Fetch recent decision ledger entries from the backend. */
export async function fetchDecisionLedger({ limit = 100 } = {}) {
  return fetchPythonAiJson(`/decision-ledger?limit=${limit}`);
}
