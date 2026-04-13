const DEFAULT_TRANSACTION_FEE_USD = 10;
/** Autonomous execution skips buys below this confidence (default 0.51 = 51% or higher passes). */
const DEFAULT_AUTONOMOUS_MIN_CONFIDENCE = 0.51;

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const TRANSACTION_FEE_USD = Math.max(
  0,
  toFiniteNumber(import.meta.env.VITE_TRANSACTION_FEE_USD, DEFAULT_TRANSACTION_FEE_USD),
);

export const AUTONOMOUS_MIN_CONFIDENCE = Math.min(
  1,
  Math.max(
    0,
    toFiniteNumber(
      import.meta.env.VITE_AUTONOMOUS_MIN_CONFIDENCE,
      DEFAULT_AUTONOMOUS_MIN_CONFIDENCE,
    ),
  ),
);

