import { describe, it, expect } from 'vitest';
import { isWithinUsEasternTradingHours } from './marketHours.js';

describe('isWithinUsEasternTradingHours', () => {
  it('returns true during regular weekday trading hours in ET', () => {
    // 14:30 UTC on Jan 15, 2026 is 9:30 AM ET (EST), a Thursday.
    const duringMarket = new Date('2026-01-15T14:30:00.000Z');
    expect(isWithinUsEasternTradingHours(duringMarket)).toBe(true);
  });

  it('returns false before the opening bell in ET', () => {
    // 13:59 UTC on Jan 15, 2026 is 8:59 AM ET.
    const preMarket = new Date('2026-01-15T13:59:00.000Z');
    expect(isWithinUsEasternTradingHours(preMarket)).toBe(false);
  });

  it('returns false at and after market close in ET', () => {
    // 21:00 UTC on Jan 15, 2026 is 4:00 PM ET.
    const atClose = new Date('2026-01-15T21:00:00.000Z');
    expect(isWithinUsEasternTradingHours(atClose)).toBe(false);
  });

  it('returns false on weekends even during daytime ET', () => {
    // 15:00 UTC on Jan 17, 2026 is 10:00 AM ET Saturday.
    const weekend = new Date('2026-01-17T15:00:00.000Z');
    expect(isWithinUsEasternTradingHours(weekend)).toBe(false);
  });
});
