import { describe, it, expect } from 'vitest';
import { tradeReducer, initialTradeState } from './tradeReducer';

const BASE = { ...initialTradeState };

describe('tradeReducer', () => {
  it('returns initial state for unknown action', () => {
    // tradeReducer has no default parameter; pass initialTradeState explicitly.
    const state = tradeReducer(initialTradeState, { type: '@@INIT' });
    expect(state.isTradeModalOpen).toBe(false);
    expect(state.isCashModalOpen).toBe(false);
    expect(state.tradingMode).toBeDefined();
  });

  it('SET_TRADE_MODAL_OPEN toggles modal', () => {
    const open = tradeReducer(BASE, { type: 'SET_TRADE_MODAL_OPEN', payload: true });
    expect(open.isTradeModalOpen).toBe(true);
    const closed = tradeReducer(open, { type: 'SET_TRADE_MODAL_OPEN', payload: false });
    expect(closed.isTradeModalOpen).toBe(false);
  });

  it('SET_CASH_MODAL_OPEN opens cash modal', () => {
    const next = tradeReducer(BASE, { type: 'SET_CASH_MODAL_OPEN', payload: true });
    expect(next.isCashModalOpen).toBe(true);
  });

  it('SET_CASH_MODAL_MODE normalizes mode', () => {
    const withdraw = tradeReducer(BASE, { type: 'SET_CASH_MODAL_MODE', payload: 'withdraw' });
    expect(withdraw.cashModalMode).toBe('withdraw');
    const deposit = tradeReducer(BASE, { type: 'SET_CASH_MODAL_MODE', payload: 'deposit' });
    expect(deposit.cashModalMode).toBe('deposit');
    // Invalid falls back to deposit
    const invalid = tradeReducer(BASE, { type: 'SET_CASH_MODAL_MODE', payload: 'unknown' });
    expect(invalid.cashModalMode).toBe('deposit');
  });

  it('SET_SELECTED_STOCK sets the stock', () => {
    const stock = { symbol: 'AAPL', price: 200 };
    const next = tradeReducer(BASE, { type: 'SET_SELECTED_STOCK', payload: stock });
    expect(next.selectedStock).toEqual(stock);
  });

  it('TOGGLE_SHOW_ALL_TRANSACTIONS flips the flag', () => {
    const on = tradeReducer(BASE, { type: 'TOGGLE_SHOW_ALL_TRANSACTIONS' });
    expect(on.showAllTransactions).toBe(true);
    const off = tradeReducer(on, { type: 'TOGGLE_SHOW_ALL_TRANSACTIONS' });
    expect(off.showAllTransactions).toBe(false);
  });

  it('SET_TRADING_MODE updates mode and clears decisions when switching away from assisted', () => {
    const assisted = { ...BASE, tradingMode: 'assisted_agent', recommendationDecisions: { k1: 'accepted' } };
    const next = tradeReducer(assisted, { type: 'SET_TRADING_MODE', payload: 'manual_user' });
    expect(next.tradingMode).toBe('manual_user');
    expect(next.recommendationDecisions).toEqual({});
  });

  it('SET_TRADING_MODE preserves decisions when already assisted_agent', () => {
    const assisted = { ...BASE, tradingMode: 'assisted_agent', recommendationDecisions: { k1: 'accepted' } };
    const next = tradeReducer(assisted, { type: 'SET_TRADING_MODE', payload: 'assisted_agent' });
    expect(next.recommendationDecisions).toEqual({ k1: 'accepted' });
  });

  it('SET_RECOMMENDATION_DECISION records valid decisions', () => {
    const next = tradeReducer(BASE, {
      type: 'SET_RECOMMENDATION_DECISION',
      payload: { key: 'rec-1', decision: 'accepted' },
    });
    expect(next.recommendationDecisions['rec-1']).toBe('accepted');
  });

  it('SET_RECOMMENDATION_DECISION ignores invalid decision values', () => {
    const next = tradeReducer(BASE, {
      type: 'SET_RECOMMENDATION_DECISION',
      payload: { key: 'rec-1', decision: 'maybe' },
    });
    expect(next.recommendationDecisions['rec-1']).toBeUndefined();
  });

  it('SET_RECOMMENDATION_ORDER_STATUS updates status', () => {
    const next = tradeReducer(BASE, {
      type: 'SET_RECOMMENDATION_ORDER_STATUS',
      payload: { key: 'rec-1', status: 'submitting' },
    });
    expect(next.recommendationOrderStatus['rec-1']).toBe('submitting');
  });

  it('SET_RECOMMENDATION_ORDER_STATUS ignores unknown status', () => {
    const next = tradeReducer(BASE, {
      type: 'SET_RECOMMENDATION_ORDER_STATUS',
      payload: { key: 'rec-1', status: 'bogus' },
    });
    expect(next.recommendationOrderStatus['rec-1']).toBeUndefined();
  });

  it('SET_RECOMMENDATION_ORDER_ERROR records error message', () => {
    const next = tradeReducer(BASE, {
      type: 'SET_RECOMMENDATION_ORDER_ERROR',
      payload: { key: 'rec-1', error: 'Price unavailable' },
    });
    expect(next.recommendationOrderErrors['rec-1']).toBe('Price unavailable');
  });

  it('CLEAR_RECOMMENDATION_DECISIONS resets all recommendation state', () => {
    const state = {
      ...BASE,
      recommendationDecisions: { k1: 'accepted' },
      recommendationOrderStatus: { k1: 'submitted' },
      recommendationOrderErrors: { k1: '' },
    };
    const next = tradeReducer(state, { type: 'CLEAR_RECOMMENDATION_DECISIONS' });
    expect(next.recommendationDecisions).toEqual({});
    expect(next.recommendationOrderStatus).toEqual({});
    expect(next.recommendationOrderErrors).toEqual({});
  });
});
