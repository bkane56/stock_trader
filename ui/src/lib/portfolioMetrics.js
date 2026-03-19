export function clampPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
}

export function strategyFromGrowth(growthPct) {
  const safeGrowth = clampPercentage(growthPct);
  return {
    strategyGrowthPct: safeGrowth,
    strategyFixedPct: 100 - safeGrowth,
  };
}

export function calculateHoldingMarketValue(holding) {
  const shares = Number(holding.shares) || 0;
  const price = Number(holding.price) || Number(holding.updatedPrice) || 0;
  return shares * price;
}

export function calculateHoldingInvestedAmount(holding) {
  const shares = Number(holding.shares) || 0;
  const avgCost = Number(holding.avgCost) || Number(holding.price) || 0;
  return shares * avgCost;
}

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
