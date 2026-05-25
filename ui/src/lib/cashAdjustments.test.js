import { describe, it, expect } from 'vitest';
import { computeCashAdjustment, parsePositiveAmount } from './cashAdjustments.js';

describe('parsePositiveAmount', () => {
  it('returns positive finite numbers only', () => {
    expect(parsePositiveAmount(100)).toBe(100);
    expect(parsePositiveAmount('42.5')).toBe(42.5);
    expect(parsePositiveAmount(0)).toBe(0);
    expect(parsePositiveAmount(-10)).toBe(0);
    expect(parsePositiveAmount('abc')).toBe(0);
  });
});

describe('computeCashAdjustment', () => {
  it('handles deposit correctly', () => {
    const result = computeCashAdjustment({ currentCash: 1000, mode: 'deposit', amount: 250.5 });
    expect(result.nextCash).toBe(1250.5);
    expect(result.normalizedAmount).toBe(250.5);
    expect(result.eventType).toBe('DEPOSIT');
    expect(result.eventSymbol).toBe('CASH+');
    expect(result.transactionType).toBe('Cash Deposit');
  });

  it('handles withdraw correctly', () => {
    const result = computeCashAdjustment({ currentCash: 1000, mode: 'withdraw', amount: 300 });
    expect(result.nextCash).toBe(700);
    expect(result.normalizedAmount).toBe(300);
    expect(result.eventType).toBe('WITHDRAW');
    expect(result.eventSymbol).toBe('CASH-');
    expect(result.transactionType).toBe('Cash Withdrawal');
  });

  it('rejects invalid amount', () => {
    expect(() =>
      computeCashAdjustment({ currentCash: 1000, mode: 'deposit', amount: 0 })
    ).toThrow(/Amount must be greater than zero/);
  });

  it('rejects overdraft withdraw', () => {
    expect(() =>
      computeCashAdjustment({ currentCash: 1000, mode: 'withdraw', amount: 1200 })
    ).toThrow(/Withdraw amount exceeds your available cash reserve/);
  });
});
