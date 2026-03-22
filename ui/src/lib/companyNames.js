import { TRADEABLE_STOCKS } from "../data/tradeableStocks";

const COMPANY_NAMES_STORAGE_KEY = "investai.companyNames.v1";

const COMMON_COMPANY_NAMES = {
  AAPL: "Apple Inc.",
  AMZN: "Amazon.com Inc.",
  AMD: "Advanced Micro Devices, Inc.",
  ASML: "ASML Holding N.V.",
  AVGO: "Broadcom Inc.",
  GOOGL: "Alphabet Inc.",
  IEF: "iShares 7-10 Year Treasury Bond ETF",
  JNJ: "Johnson & Johnson",
  JPM: "JPMorgan Chase & Co.",
  META: "Meta Platforms, Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  QQQ: "Invesco QQQ Trust",
  SPY: "SPDR S&P 500 ETF Trust",
  TSLA: "Tesla, Inc.",
  UNH: "UnitedHealth Group Incorporated",
  V: "Visa Inc.",
};

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || "").trim();
}

function isTickerOnlyName(symbol, name) {
  return normalizeName(name).toUpperCase() === normalizeSymbol(symbol);
}

function readStoredCompanyNames() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(COMPANY_NAMES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_error) {
    return {};
  }
}

function writeStoredCompanyNames(namesBySymbol) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      COMPANY_NAMES_STORAGE_KEY,
      JSON.stringify(namesBySymbol),
    );
  } catch (_error) {
    // Ignore localStorage write issues (private mode, quota, etc.).
  }
}

const STORED_COMPANY_NAMES = readStoredCompanyNames();

const COMPANY_NAME_BY_SYMBOL = new Map(
  [
    ...Object.entries(COMMON_COMPANY_NAMES),
    ...Object.entries(STORED_COMPANY_NAMES),
    ...TRADEABLE_STOCKS.map((stock) => [
      String(stock?.symbol || "").trim().toUpperCase(),
      String(stock?.name || "").trim(),
    ]),
  ].filter(([symbol, name]) => symbol && name)
);

export function companyNameFromSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return "";
  return COMPANY_NAME_BY_SYMBOL.get(normalized) || "";
}

export function resolveCompanyName(symbol, preferredName = "") {
  const normalized = normalizeSymbol(symbol);
  const trimmedPreferred = normalizeName(preferredName);
  if (!normalized) return trimmedPreferred;

  if (trimmedPreferred && trimmedPreferred.toUpperCase() !== normalized) {
    return trimmedPreferred;
  }
  return companyNameFromSymbol(normalized) || trimmedPreferred || normalized;
}

export function registerCompanyName(symbol, name) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedName = normalizeName(name);
  if (!normalizedSymbol || !normalizedName) return false;
  if (isTickerOnlyName(normalizedSymbol, normalizedName)) return false;

  const current = COMPANY_NAME_BY_SYMBOL.get(normalizedSymbol);
  if (current === normalizedName) return false;

  COMPANY_NAME_BY_SYMBOL.set(normalizedSymbol, normalizedName);

  const currentStored = readStoredCompanyNames();
  currentStored[normalizedSymbol] = normalizedName;
  writeStoredCompanyNames(currentStored);
  return true;
}

export function registerCompanyNames(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  let updates = 0;
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const symbol = entry.symbol;
    const name = entry.name || entry.company_name || entry.companyName;
    if (registerCompanyName(symbol, name)) {
      updates += 1;
    }
  });
  return updates;
}
