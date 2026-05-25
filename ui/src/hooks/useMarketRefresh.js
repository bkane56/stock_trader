/**
 * Provides on-demand intraday price refresh for portfolio holdings.
 * Falls back to the original holdings on timeout or network failure.
 */
import { useCallback } from "react";
import { refreshHoldingsMarketPricesFromQuotes } from "../services/instantdb/portfolioStore";
import { isInstantDbEnabled } from "../services/instantdb/client";

const REFRESH_BUDGET_MS = 28_000;

/**
 * @returns {{ refreshHoldings: (holdings: Array) => Promise<Array> }}
 */
export function useMarketRefresh() {
  /**
   * Refresh market prices for an array of holdings.
   * Times out after REFRESH_BUDGET_MS and falls back to the input holdings.
   *
   * @param {Array} holdings - Current portfolio holdings
   * @returns {Promise<Array>} Holdings with updated intraday prices
   */
  const refreshHoldings = useCallback(async (holdings) => {
    if (!isInstantDbEnabled || !holdings.length) return holdings;
    return Promise.race([
      refreshHoldingsMarketPricesFromQuotes(holdings),
      new Promise((resolve) => setTimeout(() => resolve(holdings), REFRESH_BUDGET_MS)),
    ]).catch(() => holdings);
  }, []);

  return { refreshHoldings };
}
