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
