/**
 * Shared fetch helpers for the Python AI API.
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8010";

/** Returns the configured Python AI base URL without a trailing slash. */
export function getPythonAiBaseUrl() {
  const raw = import.meta.env.VITE_PYTHON_AI_BASE_URL || DEFAULT_API_BASE_URL;
  return raw.replace(/\/$/, "");
}

function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const apiKey = String(import.meta.env.VITE_API_SECRET_KEY || "").trim();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

/**
 * Fetch JSON from the Python AI API with optional API-key auth.
 * @param {string} path - Path beginning with `/`.
 * @param {RequestInit} [init]
 */
export async function fetchPythonAiJson(path, init = {}) {
  const response = await fetch(`${getPythonAiBaseUrl()}${path}`, {
    ...init,
    headers: apiHeaders(init.headers || {}),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.detail || "").trim();
    } catch {
      detail = "";
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`API request failed (${response.status})${suffix}`);
  }
  return response.json();
}
