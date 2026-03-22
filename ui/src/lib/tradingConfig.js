const DEFAULT_TRANSACTION_FEE_USD = 10;
const DEFAULT_AUTONOMOUS_MIN_CONFIDENCE = 0.7;

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

