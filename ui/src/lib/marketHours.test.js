import test from "node:test";
import assert from "node:assert/strict";
import { isWithinUsEasternTradingHours } from "./marketHours.js";

test("returns true during regular weekday trading hours in ET", () => {
  // 14:30 UTC on Jan 15, 2026 is 9:30 AM ET (EST), a Thursday.
  const duringMarket = new Date("2026-01-15T14:30:00.000Z");
  assert.equal(isWithinUsEasternTradingHours(duringMarket), true);
});

test("returns false before the opening bell in ET", () => {
  // 13:59 UTC on Jan 15, 2026 is 8:59 AM ET.
  const preMarket = new Date("2026-01-15T13:59:00.000Z");
  assert.equal(isWithinUsEasternTradingHours(preMarket), false);
});

test("returns false at and after market close in ET", () => {
  // 21:00 UTC on Jan 15, 2026 is 4:00 PM ET.
  const atClose = new Date("2026-01-15T21:00:00.000Z");
  assert.equal(isWithinUsEasternTradingHours(atClose), false);
});

test("returns false on weekends even during daytime ET", () => {
  // 15:00 UTC on Jan 17, 2026 is 10:00 AM ET Saturday.
  const weekend = new Date("2026-01-17T15:00:00.000Z");
  assert.equal(isWithinUsEasternTradingHours(weekend), false);
});
