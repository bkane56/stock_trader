import { describe, it, expect } from "vitest";
import {
  formatNextMarketOpenLabel,
  getEasternDateKey,
  getNextUsEquitySessionOpen,
  getUsMarketStatus,
  isUsEquityHoliday,
  isUsEquityTradingDay,
  isWithinUsEasternTradingHours,
} from "./marketHours.js";

describe("isWithinUsEasternTradingHours", () => {
  it("returns true during regular weekday trading hours in ET", () => {
    const duringMarket = new Date("2026-01-15T14:30:00.000Z");
    expect(isWithinUsEasternTradingHours(duringMarket)).toBe(true);
  });

  it("returns false before the opening bell in ET", () => {
    const preMarket = new Date("2026-01-15T13:59:00.000Z");
    expect(isWithinUsEasternTradingHours(preMarket)).toBe(false);
  });

  it("returns false at and after market close in ET", () => {
    const atClose = new Date("2026-01-15T21:00:00.000Z");
    expect(isWithinUsEasternTradingHours(atClose)).toBe(false);
  });

  it("returns false on weekends even during daytime ET", () => {
    const weekend = new Date("2026-01-17T15:00:00.000Z");
    expect(isWithinUsEasternTradingHours(weekend)).toBe(false);
  });

  it("returns false on Memorial Day 2026 during regular hours", () => {
    const memorialDay = new Date("2026-05-25T14:30:00.000Z");
    expect(isWithinUsEasternTradingHours(memorialDay)).toBe(false);
  });
});

describe("isUsEquityTradingDay", () => {
  it("treats Memorial Day 2026 as a non-trading day", () => {
    expect(isUsEquityHoliday(new Date("2026-05-25T14:30:00.000Z"))).toBe(true);
    expect(isUsEquityTradingDay(new Date("2026-05-25T14:30:00.000Z"))).toBe(false);
  });

  it("treats a regular Thursday as a trading day", () => {
    expect(isUsEquityTradingDay(new Date("2026-01-15T14:30:00.000Z"))).toBe(true);
  });
});

describe("getUsMarketStatus", () => {
  it("reports holiday on Memorial Day 2026", () => {
    const status = getUsMarketStatus(new Date("2026-05-25T14:30:00.000Z"));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe("holiday");
    expect(status.nextOpenAt).toBeInstanceOf(Date);
  });

  it("reports after_hours on a weekday evening", () => {
    const status = getUsMarketStatus(new Date("2026-01-15T22:00:00.000Z"));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe("after_hours");
  });

  it("reports open during the regular session", () => {
    const status = getUsMarketStatus(new Date("2026-01-15T14:30:00.000Z"));
    expect(status.isOpen).toBe(true);
    expect(status.reason).toBe("open");
  });
});

describe("getNextUsEquitySessionOpen", () => {
  it("returns Tuesday May 26 after Memorial Day 2026", () => {
    const nextOpen = getNextUsEquitySessionOpen(new Date("2026-05-25T14:30:00.000Z"));
    expect(getEasternDateKey(nextOpen)).toBe("2026-05-26");
  });

  it("returns Monday after Friday evening close", () => {
    const fridayAfterClose = new Date("2026-01-16T22:00:00.000Z");
    const nextOpen = getNextUsEquitySessionOpen(fridayAfterClose);
    expect(getEasternDateKey(nextOpen)).toBe("2026-01-20");
  });
});

describe("formatNextMarketOpenLabel", () => {
  it("formats a readable next-open label", () => {
    const nextOpen = getNextUsEquitySessionOpen(new Date("2026-05-25T14:30:00.000Z"));
    expect(formatNextMarketOpenLabel(nextOpen)).toMatch(/May 26/);
  });
});
