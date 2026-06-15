/**
 * Client for the decision ledger API.
 */

import { fetchPythonAiJson } from "./apiClient";

/** Fetch recent decision ledger entries from the backend. */
export async function fetchDecisionLedger({ limit = 100 } = {}) {
  return fetchPythonAiJson(`/decision-ledger?limit=${limit}`);
}

/** Delete all decision ledger entries from the backend. */
export async function clearDecisionLedger() {
  return fetchPythonAiJson("/decision-ledger", { method: "DELETE" });
}
