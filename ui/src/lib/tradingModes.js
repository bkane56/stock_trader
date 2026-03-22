export const TRADING_MODES = [
  {
    id: "manual_user",
    label: "Manual",
    shortLabel: "User",
    description:
      "You place every trade manually and use AI output as recommendations only.",
  },
  {
    id: "assisted_agent",
    label: "Assisted",
    shortLabel: "Review",
    description:
      "Research and investing agents propose actions, and you accept or decline each one.",
  },
  {
    id: "autonomous_agent",
    label: "Autonomous",
    shortLabel: "Auto",
    description: "Agents can execute buys and sells automatically based on strategy rules.",
  },
];

export const DEFAULT_TRADING_MODE = TRADING_MODES[0].id;
const TRADING_MODE_STORAGE_KEY = "investai.tradingMode";

const MODES_BY_ID = new Map(TRADING_MODES.map((mode) => [mode.id, mode]));

export function normalizeTradingMode(mode) {
  return MODES_BY_ID.has(mode) ? mode : DEFAULT_TRADING_MODE;
}

export function getTradingMode(mode) {
  return MODES_BY_ID.get(normalizeTradingMode(mode)) || TRADING_MODES[0];
}

export function readPersistedTradingMode() {
  if (typeof window === "undefined") {
    return DEFAULT_TRADING_MODE;
  }
  try {
    const saved = window.localStorage.getItem(TRADING_MODE_STORAGE_KEY);
    return normalizeTradingMode(saved || DEFAULT_TRADING_MODE);
  } catch (_error) {
    return DEFAULT_TRADING_MODE;
  }
}

export function persistTradingMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRADING_MODE_STORAGE_KEY, normalizeTradingMode(mode));
  } catch (_error) {
    // Ignore localStorage write errors (private mode, quota, etc.)
  }
}
