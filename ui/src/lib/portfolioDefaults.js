/** Default paper portfolio cash (USD) for new portfolios, reset, and local fallback state. */
export const DEFAULT_PORTFOLIO_CASH_USD = 100_000;

const DEFAULT_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES = 15;

function parseAutonomousResearchIntervalMinutes() {
  const raw = import.meta.env.VITE_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES;
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES;
}

/** Milliseconds between autonomous research/briefing refreshes (configurable via VITE_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES). */
export const AUTONOMOUS_RESEARCH_INTERVAL_MS =
  parseAutonomousResearchIntervalMinutes() * 60 * 1000;
