import { describe, it, expect } from 'vitest';
import {
  clampPercentage,
  strategyFromGrowth,
  calculateHoldingMarketValue,
  calculateHoldingInvestedAmount,
  calculatePortfolioMetrics,
} from './portfolioMetrics';

describe('clampPercentage', () => {
  it('returns the value unchanged when in range', () => {
    expect(clampPercentage(50)).toBe(50);
    expect(clampPercentage(0)).toBe(0);
    expect(clampPercentage(100)).toBe(100);
  });

  it('clamps negative to 0', () => {
    expect(clampPercentage(-5)).toBe(0);
  });

  it('clamps values above 100 to 100', () => {
    expect(clampPercentage(200)).toBe(100);
  });

  it('returns 0 for NaN and non-finite values', () => {
    expect(clampPercentage(NaN)).toBe(0);
    // Infinity is not finite, so the function returns 0
    expect(clampPercentage(Infinity)).toBe(0);
    expect(clampPercentage(-Infinity)).toBe(0);
    expect(clampPercentage('abc')).toBe(0);
  });
});

describe('strategyFromGrowth', () => {
  it('computes complementary fixed percentage', () => {
    const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(60);
    expect(strategyGrowthPct).toBe(60);
    expect(strategyFixedPct).toBe(40);
  });

  it('handles 0% growth', () => {
    const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(0);
    expect(strategyGrowthPct).toBe(0);
    expect(strategyFixedPct).toBe(100);
  });
});

describe('calculateHoldingMarketValue', () => {
  it('calculates shares × price', () => {
    expect(calculateHoldingMarketValue({ shares: 10, price: 150 })).toBe(1500);
  });

  it('falls back to updatedPrice when price is absent', () => {
    expect(calculateHoldingMarketValue({ shares: 5, price: 0, updatedPrice: 200 })).toBe(1000);
  });

  it('returns 0 for missing values', () => {
    expect(calculateHoldingMarketValue({})).toBe(0);
  });
});

describe('calculateHoldingInvestedAmount', () => {
  it('uses avgCost when present', () => {
    expect(calculateHoldingInvestedAmount({ shares: 4, avgCost: 100, price: 150 })).toBe(400);
  });

  it('falls back to price when avgCost is absent', () => {
    expect(calculateHoldingInvestedAmount({ shares: 4, price: 150 })).toBe(600);
  });
});

describe('calculatePortfolioMetrics', () => {
  const holdings = [
    { shares: 10, price: 100, avgCost: 80 },
    { shares: 5, price: 200, avgCost: 200 },
  ];

  it('computes totalValue as cash + positions market value', () => {
    const { totalValue } = calculatePortfolioMetrics(holdings, 500);
    // 10*100 + 5*200 = 1000+1000 = 2000; +500 = 2500
    expect(totalValue).toBe(2500);
  });

  it('computes investedAmount using avgCost', () => {
    const { investedAmount } = calculatePortfolioMetrics(holdings, 0);
    // 10*80 + 5*200 = 800+1000 = 1800
    expect(investedAmount).toBe(1800);
  });

  it('returns zeros for empty portfolio', () => {
    const { totalValue, investedAmount, positionsMarketValue } = calculatePortfolioMetrics([], 0);
    expect(totalValue).toBe(0);
    expect(investedAmount).toBe(0);
    expect(positionsMarketValue).toBe(0);
  });

  it('treats non-numeric cashReserve as 0', () => {
    const { cashReserve } = calculatePortfolioMetrics([], null);
    expect(cashReserve).toBe(0);
  });
});
