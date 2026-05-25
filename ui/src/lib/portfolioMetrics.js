/**
 * Clamps a percentage value to [0, 100].
 * Returns 0 for any non-finite input (NaN, ±Infinity, non-numeric strings).
 * @param {*} value
 * @returns {number}
 */
export function clampPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
}

/**
 * Derives the strategy split object from a growth allocation percentage.
 * @param {number} growthPct - Desired growth-equity allocation in [0, 100].
 * @returns {{ strategyGrowthPct: number, strategyFixedPct: number }}
 */
export function strategyFromGrowth(growthPct) {
  const safeGrowth = clampPercentage(growthPct);
  return {
    strategyGrowthPct: safeGrowth,
    strategyFixedPct: 100 - safeGrowth,
  };
}

/**
 * Calculates the current market value of a single holding.
 * Falls back to `updatedPrice` when `price` is zero.
 * @param {{ shares?: number, price?: number, updatedPrice?: number }} holding
 * @returns {number}
 */
export function calculateHoldingMarketValue(holding) {
  const shares = Number(holding.shares) || 0;
  const price = Number(holding.price) || Number(holding.updatedPrice) || 0;
  return shares * price;
}

/**
 * Calculates the original cost basis for a single holding.
 * Falls back to `price` when `avgCost` is absent.
 * @param {{ shares?: number, avgCost?: number, price?: number }} holding
 * @returns {number}
 */
export function calculateHoldingInvestedAmount(holding) {
  const shares = Number(holding.shares) || 0;
  const avgCost = Number(holding.avgCost) || Number(holding.price) || 0;
  return shares * avgCost;
}

/**
 * Computes aggregate portfolio metrics from holdings and available cash.
 * @param {Array<{ shares?: number, price?: number, avgCost?: number }>} holdings
 * @param {number|null} cashReserve
 * @returns {{ investedAmount: number, positionsMarketValue: number, totalValue: number, cashReserve: number }}
 */
export function calculatePortfolioMetrics(holdings, cashReserve) {
  const investedAmount = holdings.reduce(
    (sum, holding) => sum + calculateHoldingInvestedAmount(holding),
    0
  );
  const positionsMarketValue = holdings.reduce(
    (sum, holding) => sum + calculateHoldingMarketValue(holding),
    0
  );
  const cash = Number(cashReserve) || 0;
  return {
    investedAmount,
    positionsMarketValue,
    totalValue: cash + positionsMarketValue,
    cashReserve: cash,
  };
}
