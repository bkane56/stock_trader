import { computeCashAdjustment } from "../../lib/cashAdjustments";
import { resolveCompanyName } from "../../lib/companyNames";
import { clampPercentage, strategyFromGrowth } from "../../lib/portfolioMetrics";
import { instantDb, instantId } from "./client";

const DEFAULT_CASH_RESERVE = 250000;
const DEFAULT_GROWTH_PCT = 60;

function formatDate(isoOrMs) {
  const date = new Date(isoOrMs);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isRecordAfterReset(recordTime, resetAt) {
  if (!resetAt) return true;
  return Number(recordTime || 0) >= Number(resetAt);
}

function isTickerOnlyName(symbol, name) {
  return String(name || "").trim().toUpperCase() === String(symbol || "").trim().toUpperCase();
}

export async function upsertCompanyNamesForUser(
  userId,
  entries = [],
  existingRecords = []
) {
  if (!instantDb) return 0;
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return 0;
  if (!Array.isArray(entries) || !entries.length) return 0;

  const deduped = new Map();
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const symbol = String(entry.symbol || "").trim().toUpperCase();
    const name = String(
      entry.name || entry.company_name || entry.companyName || ""
    ).trim();
    if (!symbol || !name) return;
    if (isTickerOnlyName(symbol, name)) return;
    deduped.set(symbol, name);
  });

  if (!deduped.size) return 0;
  const existingBySymbol = new Map(
    (existingRecords || [])
      .filter((row) => String(row?.userId || "").trim() === normalizedUserId)
      .map((row) => [String(row?.symbol || "").trim().toUpperCase(), row])
  );
  const txs = Array.from(deduped.entries())
    .filter(([symbol, name]) => {
      const existing = existingBySymbol.get(symbol);
      return !existing || String(existing.name || "").trim() !== name;
    })
    .map(([symbol, name]) =>
      instantDb.tx.company_names[
        existingBySymbol.get(symbol)?.id || instantId()
      ].update({
        userId: normalizedUserId,
        symbol,
        name,
        updatedAt: Date.now(),
      })
    );
  if (!txs.length) return 0;
  await instantDb.transact(txs);
  return txs.length;
}

export function resolveDisplayUser(authUser, profile) {
  if (!authUser) return null;
  if (profile) return profile;
  const email = authUser.email || "investor@example.com";
  const [firstNameRaw = "Investor"] = email.split("@");
  const firstName = firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
  return {
    id: authUser.id,
    firstName,
    lastName: "",
    fullName: firstName,
    email,
    tier: "InstantDB Account",
    avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(email)}`,
  };
}

export function pickUserPortfolio(data, userId) {
  const portfolios = data?.portfolios || [];
  if (!userId) return null;
  return portfolios.find((portfolio) => portfolio.userId === userId) || null;
}

export function pickPortfolioData(data, portfolioId) {
  if (!portfolioId) {
    return { portfolio: null, positions: [], events: [] };
  }
  const portfolio = (data?.portfolios || []).find((p) => p.id === portfolioId) || null;
  const positions = (data?.positions || []).filter(
    (position) => position.portfolioId === portfolioId
  );
  const events = (data?.portfolio_events || []).filter(
    (event) => event.portfolioId === portfolioId
  );
  return { portfolio, positions, events };
}

export async function ensurePortfolioForUser(userId) {
  if (!instantDb || !userId) return;

  const createdAt = Date.now();
  const portfolioId = instantId();
  const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(DEFAULT_GROWTH_PCT);

  const bootstrapTxs = [
    instantDb.tx.users[userId].update({
      userId,
      createdAt,
      updatedAt: createdAt,
    }),
    instantDb.tx.portfolios[portfolioId].update({
      userId,
      name: "Main Portfolio",
      baseCurrency: "USD",
      cashReserve: DEFAULT_CASH_RESERVE,
      strategyGrowthPct,
      strategyFixedPct,
      createdAt,
      updatedAt: createdAt,
    }).link({ owner: userId }),
  ];

  // Stage writes so owner-based refs are resolvable before child records are created.
  await instantDb.transact(bootstrapTxs);
}

export async function ensurePortfolioOwnershipLink(portfolioId, userId) {
  if (!instantDb || !portfolioId || !userId) return;
  await instantDb.transact(
    instantDb.tx.portfolios[portfolioId].link({ owner: userId })
  );
}

export async function seedPortfolioDefaultsIfEmpty(portfolioId, positionRecords = [], eventRecords = []) {
  if (!instantDb || !portfolioId) return;
  if (positionRecords.length > 0 || eventRecords.length > 0) return;
}

function buildTransactionsFromEvents(events = [], resetAt = 0, namesBySymbol = {}) {
  const ordered = [...events]
    .filter((event) => Number(event.eventAt || 0) >= Number(resetAt || 0))
    .sort((a, b) => (b.eventAt || 0) - (a.eventAt || 0));
  return ordered.map((event) => ({
    symbol: event.symbol || "--",
    name: resolveCompanyName(
      event.symbol || "",
      namesBySymbol[String(event.symbol || "").toUpperCase()] || event.asset || event.symbol || ""
    ),
    id: event.id,
    asset: resolveCompanyName(
      event.symbol || "",
      namesBySymbol[String(event.symbol || "").toUpperCase()] || event.asset || event.symbol || "Portfolio Event"
    ),
    type:
      event.eventType === "SELL"
        ? "Sell Order"
        : event.eventType === "DEPOSIT"
          ? "Cash Deposit"
          : event.eventType === "WITHDRAW"
            ? "Cash Withdrawal"
        : event.eventType === "CASH_ADJUSTMENT"
          ? "Cash Adjustment"
          : "Buy Order",
    date: formatDate(event.eventAt || Date.now()),
    dateAcquired: new Date(event.eventAt || Date.now()).toISOString(),
    amount: Number(event.amount) || 0,
    shares: Number(event.shares) || 0,
    status: event.status || "Completed",
  }));
}

export function filterActivePositions(positionRecords = [], resetAt = 0) {
  return positionRecords.filter((position) =>
    isRecordAfterReset(position.createdAt, resetAt)
  );
}

export function buildPortfolioState(
  portfolioRecord,
  positionRecords = [],
  eventRecords = [],
  companyNameRecords = []
) {
  const activePositions = filterActivePositions(positionRecords, portfolioRecord?.resetAt);
  const namesFromDb = Object.fromEntries(
    (companyNameRecords || [])
      .filter((row) => String(row?.symbol || "").trim())
      .map((row) => {
        const symbol = String(row.symbol || "").trim().toUpperCase();
        return [symbol, resolveCompanyName(symbol, row.name)];
      })
  );
  const namesFromPositions = Object.fromEntries(
    activePositions
      .filter((position) => String(position?.symbol || "").trim())
      .map((position) => {
        const symbol = String(position.symbol || "").trim().toUpperCase();
        return [symbol, resolveCompanyName(symbol, position.name)];
      })
  );
  const namesFromEvents = Object.fromEntries(
    (eventRecords || [])
      .filter((event) => String(event?.symbol || "").trim())
      .map((event) => {
        const symbol = String(event.symbol || "").trim().toUpperCase();
        return [symbol, resolveCompanyName(symbol, event.asset)];
      })
  );
  const namesBySymbol = { ...namesFromEvents, ...namesFromPositions, ...namesFromDb };
  const holdings = activePositions
    .map((position) => {
      const price = Number(position.updatedPrice) || Number(position.avgCost) || 0;
      const shares = Number(position.shares) || 0;
      const symbol = String(position.symbol || "").trim().toUpperCase();
      const resolvedName = resolveCompanyName(
        symbol,
        namesFromDb[symbol] || position.name
      );
      return {
        id: position.id,
        symbol,
        name: resolvedName,
        sector: position.sector || "Other",
        shares,
        price,
        avgCost: Number(position.avgCost) || price,
        totalValue: shares * price,
        dateAcquired: position.createdAt
          ? new Date(position.createdAt).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        analysis: {
          tag: position.analysisTag || "Position",
          text: position.analysisText || "Position synced from InstantDB.",
        },
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const growth = clampPercentage(portfolioRecord?.strategyGrowthPct ?? DEFAULT_GROWTH_PCT);
  const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(growth);

  return {
    portfolioId: portfolioRecord?.id || null,
    holdings,
    transactions: buildTransactionsFromEvents(
      eventRecords,
      portfolioRecord?.resetAt,
      namesBySymbol
    ),
    cash: Number(portfolioRecord?.cashReserve) || 0,
    resetAt: portfolioRecord?.resetAt || null,
    strategyGrowthPct,
    strategyFixedPct,
    isHydrated: Boolean(portfolioRecord),
  };
}

function clampShares(shares) {
  const numeric = Number(shares);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export async function persistStrategySplit(portfolioId, growthPct) {
  if (!instantDb || !portfolioId) return;
  const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(growthPct);
  await instantDb.transact(
    instantDb.tx.portfolios[portfolioId].update({
      strategyGrowthPct,
      strategyFixedPct,
      updatedAt: Date.now(),
    })
  );
}

export async function adjustCashReserve({ portfolio, mode, amount }) {
  if (!instantDb) return;
  if (!portfolio?.id) {
    throw new Error("Portfolio not ready yet. Please retry in a moment.");
  }

  const { nextCash, normalizedAmount, eventType, eventAsset, eventSymbol } =
    computeCashAdjustment({
      currentCash: portfolio.cashReserve,
      mode,
      amount,
    });
  const now = Date.now();
  await instantDb.transact(
    instantDb.tx.portfolios[portfolio.id].update({
      cashReserve: nextCash,
      updatedAt: now,
    })
  );

  try {
    await instantDb.transact(
      instantDb.tx.portfolio_events[instantId()].update({
        portfolioId: portfolio.id,
        eventType,
        symbol: eventSymbol,
        asset: eventAsset,
        amount: normalizedAmount,
        status: "Completed",
        eventAt: now,
      }).link({ portfolio: portfolio.id })
    );
  } catch (_eventError) {
    // Keep cash updates reliable even if event-log permissions/config are stricter.
  }
}

export async function executeTrade({
  portfolio,
  positions,
  companyNameRecords = [],
  mode,
  symbol,
  name,
  sector,
  shares,
  price,
  transactionFee = 0,
}) {
  if (!instantDb) return;
  const resolvedName = resolveCompanyName(symbol, name);
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const normalizedUserId = String(portfolio?.userId || "").trim();
  const orderShares = clampShares(shares);
  if (!orderShares) {
    throw new Error("Share amount must be greater than zero.");
  }
  const marketPrice = Number(price) || 0;
  const currentCash = Number(portfolio?.cashReserve) || 0;
  const normalizedTransactionFee = Math.max(0, Number(transactionFee) || 0);
  const existing = positions.find((position) => position.symbol === symbol) || null;
  const positionsMarketValue = positions.reduce((sum, position) => {
    const positionShares = Number(position.shares) || 0;
    const positionPrice =
      Number(position.updatedPrice) || Number(position.avgCost) || Number(position.price) || 0;
    return sum + positionShares * positionPrice;
  }, 0);
  const totalPortfolioValue = currentCash + positionsMarketValue;
  const reserveFloor = totalPortfolioValue * 0.1;
  const txs = [];

  if (mode === "buy") {
    const cost = orderShares * marketPrice;
    const totalCost = cost + normalizedTransactionFee;
    if (totalCost > currentCash) {
      throw new Error("This order exceeds your available cash.");
    }
    if (currentCash - totalCost < reserveFloor) {
      throw new Error(
        "Order blocked: this buy would push cash below the 10% reserve floor."
      );
    }

    if (existing) {
      const prevShares = Number(existing.shares) || 0;
      const prevAvgCost = Number(existing.avgCost) || marketPrice;
      const newShares = prevShares + orderShares;
      const newAvgCost =
        newShares > 0
          ? (prevAvgCost * prevShares + marketPrice * orderShares) / newShares
          : marketPrice;

      txs.push(
        instantDb.tx.positions[existing.id].update({
          shares: newShares,
          avgCost: newAvgCost,
          updatedPrice: marketPrice,
          updatedAt: Date.now(),
        })
      );
    } else {
      txs.push(
        instantDb.tx.positions[instantId()].update({
          portfolioId: portfolio.id,
          symbol,
          name: resolvedName,
          sector: sector || "Other",
          shares: orderShares,
          avgCost: marketPrice,
          updatedPrice: marketPrice,
          analysisTag: "New Position",
          analysisText: "Recently added to portfolio.",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }).link({ portfolio: portfolio.id })
      );
    }

    txs.push(
      instantDb.tx.portfolios[portfolio.id].update({
        cashReserve: currentCash - totalCost,
        updatedAt: Date.now(),
      })
    );
    txs.push(
      instantDb.tx.portfolio_events[instantId()].update({
        portfolioId: portfolio.id,
        eventType: "BUY",
        symbol: normalizedSymbol,
        asset: resolvedName,
        shares: orderShares,
        price: marketPrice,
        amount: totalCost,
        transactionFee: normalizedTransactionFee,
        status: "Completed",
        eventAt: Date.now(),
      }).link({ portfolio: portfolio.id })
    );
  } else if (mode === "sell") {
    if (!existing) {
      throw new Error("You do not currently own this stock.");
    }
    const heldShares = Number(existing.shares) || 0;
    if (orderShares > heldShares) {
      throw new Error("You cannot sell more shares than you currently own.");
    }

    const proceeds = orderShares * marketPrice;
    const netProceeds = proceeds - normalizedTransactionFee;
    if (netProceeds <= 0) {
      throw new Error("Order blocked: proceeds do not cover transaction fees.");
    }
    const remainingShares = heldShares - orderShares;
    if (remainingShares <= 0) {
      txs.push(instantDb.tx.positions[existing.id].delete());
    } else {
      txs.push(
        instantDb.tx.positions[existing.id].update({
          shares: remainingShares,
          updatedPrice: marketPrice,
          updatedAt: Date.now(),
        })
      );
    }
    txs.push(
      instantDb.tx.portfolios[portfolio.id].update({
        cashReserve: currentCash + netProceeds,
        updatedAt: Date.now(),
      })
    );
    txs.push(
      instantDb.tx.portfolio_events[instantId()].update({
        portfolioId: portfolio.id,
        eventType: "SELL",
        symbol: normalizedSymbol,
        asset: resolvedName,
        shares: orderShares,
        price: marketPrice,
        amount: netProceeds,
        transactionFee: normalizedTransactionFee,
        status: "Completed",
        eventAt: Date.now(),
      }).link({ portfolio: portfolio.id })
    );
  } else {
    throw new Error(`Unsupported trade mode: ${mode}`);
  }

  if (
    normalizedUserId &&
    normalizedSymbol &&
    resolvedName &&
    !isTickerOnlyName(normalizedSymbol, resolvedName)
  ) {
    const existingCompanyNameRecord = (companyNameRecords || []).find(
      (row) =>
        String(row?.userId || "").trim() === normalizedUserId &&
        String(row?.symbol || "").trim().toUpperCase() === normalizedSymbol
    );
    const existingName = String(existingCompanyNameRecord?.name || "").trim();
    if (existingName !== resolvedName) {
      txs.push(
        instantDb.tx.company_names[
          existingCompanyNameRecord?.id || instantId()
        ].update({
          userId: normalizedUserId,
          symbol: normalizedSymbol,
          name: resolvedName,
          updatedAt: Date.now(),
        })
      );
    }
  }

  await instantDb.transact(txs);
}

export async function resetPortfolioToCashReserve({
  portfolioId,
  cashReserve = DEFAULT_CASH_RESERVE,
}) {
  if (!instantDb || !portfolioId) return;
  const now = Date.now();
  const { strategyGrowthPct, strategyFixedPct } = strategyFromGrowth(DEFAULT_GROWTH_PCT);

  const resetTxs = [
    instantDb.tx.portfolios[portfolioId].update({
      cashReserve,
      strategyGrowthPct,
      strategyFixedPct,
      resetAt: now,
      updatedAt: now,
    }),
  ];

  if (resetTxs.length) {
    await instantDb.transact(resetTxs);
  }
}
