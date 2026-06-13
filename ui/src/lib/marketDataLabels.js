/**
 * Market-data disclaimer labels aligned with backend MARKET_DATA_PROVIDER values.
 */

const PROVIDER_LABELS = {
  alpaca: "Alpaca IEX free data",
  polygon: "Polygon previous close",
  mock: "Mock demo data",
};

const PAPER_TRADING_WARNING =
  "This app is configured for paper trading. Market data may be delayed, limited, or based on the prior trading day's close.";

/** Resolve configured provider id from Vite env (defaults to polygon). */
export function getMarketDataProviderId() {
  return String(import.meta.env.VITE_MARKET_DATA_PROVIDER || "polygon").trim().toLowerCase();
}

/** Human-readable pricing source label for dashboard banners. */
export function getMarketDataSourceLabel(providerId = getMarketDataProviderId()) {
  return PROVIDER_LABELS[providerId] || PROVIDER_LABELS.polygon;
}

/** Full disclaimer shown near portfolio value and trade flows. */
export function getMarketDataDisclaimer(providerId = getMarketDataProviderId()) {
  return `Pricing source: ${getMarketDataSourceLabel(providerId)}. ${PAPER_TRADING_WARNING}`;
}

export { PAPER_TRADING_WARNING };
