import test from "node:test";
import assert from "node:assert/strict";
import { computeCashAdjustment, parsePositiveAmount } from "./cashAdjustments.js";

test("parsePositiveAmount returns positive finite numbers only", () => {
  assert.equal(parsePositiveAmount(100), 100);
  assert.equal(parsePositiveAmount("42.5"), 42.5);
  assert.equal(parsePositiveAmount(0), 0);
  assert.equal(parsePositiveAmount(-10), 0);
  assert.equal(parsePositiveAmount("abc"), 0);
});

test("computeCashAdjustment handles deposit correctly", () => {
  const result = computeCashAdjustment({
    currentCash: 1000,
    mode: "deposit",
    amount: 250.5,
  });

  assert.equal(result.nextCash, 1250.5);
  assert.equal(result.normalizedAmount, 250.5);
  assert.equal(result.eventType, "DEPOSIT");
  assert.equal(result.eventSymbol, "CASH+");
  assert.equal(result.transactionType, "Cash Deposit");
});

test("computeCashAdjustment handles withdraw correctly", () => {
  const result = computeCashAdjustment({
    currentCash: 1000,
    mode: "withdraw",
    amount: 300,
  });

  assert.equal(result.nextCash, 700);
  assert.equal(result.normalizedAmount, 300);
  assert.equal(result.eventType, "WITHDRAW");
  assert.equal(result.eventSymbol, "CASH-");
  assert.equal(result.transactionType, "Cash Withdrawal");
});

test("computeCashAdjustment rejects invalid amount", () => {
  assert.throws(
    () =>
      computeCashAdjustment({
        currentCash: 1000,
        mode: "deposit",
        amount: 0,
      }),
    /Amount must be greater than zero/
  );
});

test("computeCashAdjustment rejects overdraft withdraw", () => {
  assert.throws(
    () =>
      computeCashAdjustment({
        currentCash: 1000,
        mode: "withdraw",
        amount: 1200,
      }),
    /Withdraw amount exceeds your available cash reserve/
  );
});
