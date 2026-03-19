export function parsePositiveAmount(amount) {
  const numeric = Number(amount);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function computeCashAdjustment({ currentCash, mode, amount }) {
  const normalizedAmount = parsePositiveAmount(amount);
  if (!normalizedAmount) {
    throw new Error("Amount must be greater than zero.");
  }

  const normalizedCurrentCash = Number(currentCash) || 0;
  if (mode === "deposit") {
    return {
      nextCash: normalizedCurrentCash + normalizedAmount,
      normalizedAmount,
      eventType: "DEPOSIT",
      eventAsset: "Cash Deposit",
      eventSymbol: "CASH+",
      transactionType: "Cash Deposit",
    };
  }

  if (mode === "withdraw") {
    if (normalizedAmount > normalizedCurrentCash) {
      throw new Error("Withdraw amount exceeds your available cash reserve.");
    }
    return {
      nextCash: normalizedCurrentCash - normalizedAmount,
      normalizedAmount,
      eventType: "WITHDRAW",
      eventAsset: "Cash Withdrawal",
      eventSymbol: "CASH-",
      transactionType: "Cash Withdrawal",
    };
  }

  throw new Error(`Unsupported cash adjustment mode: ${mode}`);
}
