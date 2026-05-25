import { describe, it, expect } from 'vitest';
import { portfolioReducer, initialPortfolioState } from './portfolioReducer';

const BASE = { ...initialPortfolioState };

describe('portfolioReducer', () => {
  it('returns initial state for unknown action', () => {
    const state = portfolioReducer(undefined, { type: '@@INIT' });
    expect(state.cash).toBe(BASE.cash);
    expect(state.holdings).toEqual([]);
    expect(state.transactions).toEqual([]);
    expect(state.isHydrated).toBe(false);
  });

  describe('RESET_PORTFOLIO', () => {
    it('resets cash, holdings, and transactions', () => {
      const prior = {
        ...BASE,
        cash: 5000,
        holdings: [{ symbol: 'AAPL', shares: 10, price: 100, totalValue: 1000 }],
        transactions: [{ id: '1' }],
      };
      const next = portfolioReducer(prior, { type: 'RESET_PORTFOLIO' });
      expect(next.cash).toBe(BASE.cash);
      expect(next.holdings).toEqual([]);
      expect(next.transactions).toEqual([]);
      expect(next.resetAt).toBeGreaterThan(0);
    });
  });

  describe('HYDRATE_PORTFOLIO', () => {
    it('merges payload and marks isHydrated', () => {
      const payload = { cash: 42000, holdings: [], portfolioId: 'abc' };
      const next = portfolioReducer(BASE, { type: 'HYDRATE_PORTFOLIO', payload });
      expect(next.cash).toBe(42000);
      expect(next.portfolioId).toBe('abc');
      expect(next.isHydrated).toBe(true);
    });
  });

  describe('SET_STRATEGY_SPLIT', () => {
    it('clamps and sets growth/fixed percentages', () => {
      const next = portfolioReducer(BASE, { type: 'SET_STRATEGY_SPLIT', payload: 80 });
      expect(next.strategyGrowthPct).toBe(80);
      expect(next.strategyFixedPct).toBe(20);
    });

    it('clamps to 0 for negative input', () => {
      const next = portfolioReducer(BASE, { type: 'SET_STRATEGY_SPLIT', payload: -10 });
      expect(next.strategyGrowthPct).toBe(0);
      expect(next.strategyFixedPct).toBe(100);
    });

    it('clamps to 100 for overflow input', () => {
      const next = portfolioReducer(BASE, { type: 'SET_STRATEGY_SPLIT', payload: 150 });
      expect(next.strategyGrowthPct).toBe(100);
      expect(next.strategyFixedPct).toBe(0);
    });
  });

  describe('BUY_ADD_HOLDING', () => {
    it('adds a new holding and deducts cash', () => {
      const state = { ...BASE, cash: 100_000, holdings: [] };
      const next = portfolioReducer(state, {
        type: 'BUY_ADD_HOLDING',
        payload: { symbol: 'MSFT', name: 'Microsoft', sector: 'Tech', price: 400, shares: 2 },
      });
      expect(next.holdings).toHaveLength(1);
      expect(next.holdings[0].symbol).toBe('MSFT');
      expect(next.holdings[0].shares).toBe(2);
      expect(next.cash).toBe(100_000 - 800);
      expect(next.transactions[0].type).toBe('Buy Order');
    });

    it('accumulates shares on existing holding', () => {
      const state = {
        ...BASE,
        cash: 100_000,
        holdings: [{ symbol: 'AAPL', name: 'Apple', sector: 'Tech', shares: 5, price: 200, totalValue: 1000 }],
      };
      const next = portfolioReducer(state, {
        type: 'BUY_ADD_HOLDING',
        payload: { symbol: 'AAPL', name: 'Apple', sector: 'Tech', price: 200, shares: 3 },
      });
      expect(next.holdings).toHaveLength(1);
      expect(next.holdings[0].shares).toBe(8);
    });

    it('blocks buy when cash is insufficient', () => {
      const state = { ...BASE, cash: 100, holdings: [] };
      const next = portfolioReducer(state, {
        type: 'BUY_ADD_HOLDING',
        payload: { symbol: 'TSLA', name: 'Tesla', sector: 'Auto', price: 200, shares: 1 },
      });
      expect(next).toBe(state);
    });
  });

  describe('SELL_HOLDING', () => {
    it('removes holding fully and adds proceeds to cash', () => {
      const holding = { symbol: 'GOOG', name: 'Google', sector: 'Tech', shares: 5, price: 150, totalValue: 750 };
      const state = { ...BASE, cash: 1000, holdings: [holding] };
      const next = portfolioReducer(state, {
        type: 'SELL_HOLDING',
        payload: { symbol: 'GOOG', name: 'Google', shares: 5, price: 150 },
      });
      expect(next.holdings).toHaveLength(0);
      expect(next.cash).toBe(1000 + 750);
      expect(next.transactions[0].type).toBe('Sell Order');
    });

    it('reduces shares on partial sell', () => {
      const holding = { symbol: 'AMZN', name: 'Amazon', sector: 'Retail', shares: 10, price: 180, totalValue: 1800 };
      const state = { ...BASE, cash: 0, holdings: [holding] };
      const next = portfolioReducer(state, {
        type: 'SELL_HOLDING',
        payload: { symbol: 'AMZN', name: 'Amazon', shares: 4, price: 180 },
      });
      expect(next.holdings[0].shares).toBe(6);
      expect(next.cash).toBe(720);
    });

    it('returns same state when selling more shares than owned', () => {
      const holding = { symbol: 'AMD', name: 'AMD', sector: 'Tech', shares: 2, price: 100, totalValue: 200 };
      const state = { ...BASE, cash: 0, holdings: [holding] };
      const next = portfolioReducer(state, {
        type: 'SELL_HOLDING',
        payload: { symbol: 'AMD', name: 'AMD', shares: 5, price: 100 },
      });
      expect(next).toBe(state);
    });

    it('returns same state when holding does not exist', () => {
      const state = { ...BASE, cash: 1000, holdings: [] };
      const next = portfolioReducer(state, {
        type: 'SELL_HOLDING',
        payload: { symbol: 'XYZ', name: 'XYZ', shares: 1, price: 50 },
      });
      expect(next).toBe(state);
    });
  });

  describe('SET_PORTFOLIO_SYNCING / SET_PORTFOLIO_SYNC_ERROR', () => {
    it('sets isSyncing flag', () => {
      const next = portfolioReducer(BASE, { type: 'SET_PORTFOLIO_SYNCING', payload: true });
      expect(next.isSyncing).toBe(true);
    });

    it('clears isSyncing and sets error message', () => {
      const state = { ...BASE, isSyncing: true };
      const next = portfolioReducer(state, {
        type: 'SET_PORTFOLIO_SYNC_ERROR',
        payload: 'Something went wrong',
      });
      expect(next.isSyncing).toBe(false);
      expect(next.syncError).toBe('Something went wrong');
    });
  });
});
