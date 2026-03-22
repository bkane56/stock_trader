import seedHoldings from "../../data/portfolioHoldings.json";
import { computeCashAdjustment } from "../../lib/cashAdjustments";
import { clampPercentage, strategyFromGrowth } from "../../lib/portfolioMetrics";
import { instantDb, instantId } from "./client";

const DEFAULT_CASH_RESERVE = 42905.32;
const DEFAULT_GROWTH_PCT = 60;

function formatDate(isoOrMs) {
  const date = new Date(isoOrMs);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function holdingsToSeedEvents(holdings, portfolioId) {
  return holdings.map((holding) => {
    const eventTime = new Date(holding.dateAcquired).valueOf() || Date.now();
    return {
      id: instantId(),
      portfolioId,
      eventType: "BUY",
      symbol: holding.symbol,
      asset: holding.name,
      shares: holding.shares,
      price: holding.price,
      amount: holding.shares * holding.price,
      status: "Completed",
      eventAt: eventTime,
    };
  });
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

  const positionTxs = [];
  seedHoldings.forEach((holding) => {
    const positionId = instantId();
    const acquiredAt = new Date(holding.dateAcquired).valueOf() || createdAt;
    positionTxs.push(
      instantDb.tx.positions[positionId].update({
        portfolioId,
        symbol: holding.symbol,
        name: holding.name,
        sector: holding.sector,
        shares: holding.shares,
        avgCost: holding.price,
        updatedPrice: holding.price,
        analysisTag: holding.analysis?.tag || "Seed Position",
        analysisText: holding.analysis?.text || "Seeded from local portfolio file.",
        createdAt: acquiredAt,
        updatedAt: acquiredAt,
      }).link({ portfolio: portfolioId })
    );
  });

  const eventTxs = holdingsToSeedEvents(seedHoldings, portfolioId).map((event) =>
    instantDb.tx.portfolio_events[event.id].update(event).link({ portfolio: portfolioId })
  );

  // Stage writes so owner-based refs are resolvable before child records are created.
  await instantDb.transact(bootstrapTxs);
  if (positionTxs.length) {
    await instantDb.transact(positionTxs);
  }
  if (eventTxs.length) {
    await instantDb.transact(eventTxs);
  }
}

export async function ensurePortfolioOwnershipLink(portfolioId, userId) {
  if (!instantDb || !portfolioId || !userId) return;
  await instantDb.transact(
    instantDb.tx.portfolios[portfolioId].link({ owner: userId })
  );
}

export async function seedPortfolioDefaultsIfEmpty(portfolioId, positionRecords = [], eventRecords = []) {
  if (!instantDb || !portfolioId) return;
  if (positionRecords.length > 0) return;
  const hasTradeEvents = eventRecords.some(
    (event) => event.eventType === "BUY" || event.eventType === "SELL"
  );
  if (hasTradeEvents) return;

  const createdAt = Date.now();
  const positionTxs = [];
  seedHoldings.forEach((holding) => {
    const positionId = instantId();
    const acquiredAt = new Date(holding.dateAcquired).valueOf() || createdAt;
    positionTxs.push(
      instantDb.tx.positions[positionId].update({
        portfolioId,
        symbol: holding.symbol,
        name: holding.name,
        sector: holding.sector,
        shares: holding.shares,
        avgCost: holding.price,
        updatedPrice: holding.price,
        analysisTag: holding.analysis?.tag || "Seed Position",
        analysisText: holding.analysis?.text || "Seeded from local portfolio file.",
        createdAt: acquiredAt,
        updatedAt: acquiredAt,
      }).link({ portfolio: portfolioId })
    );
  });
  const eventTxs = holdingsToSeedEvents(seedHoldings, portfolioId).map((event) =>
    instantDb.tx.portfolio_events[event.id].update(event).link({ portfolio: portfolioId })
  );

  if (positionTxs.length) {
    await instantDb.transact(positionTxs);
  }
  if (eventTxs.length) {
    await instantDb.transact(eventTxs);
  }
}

function buildTransactionsFromEvents(events = []) {
  const ordered = [...events].sort((a, b) => (b.eventAt || 0) - (a.eventAt || 0));
  return ordered.map((event) => ({
    id: event.id,
    asset: event.asset || event.symbol || "Portfolio Event",
    symbol: event.symbol || "--",
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

export function buildPortfolioState(portfolioRecord, positionRecords = [], eventRecords = []) {
  const holdings = positionRecords
    .map((position) => {
      const price = Number(position.updatedPrice) || Number(position.avgCost) || 0;
      const shares = Number(position.shares) || 0;
      return {
        id: position.id,
        symbol: position.symbol,
        name: position.name || position.symbol,
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
    transactions: buildTransactionsFromEvents(eventRecords),
    cash: Number(portfolioRecord?.cashReserve) || 0,
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
  mode,
  symbol,
  name,
  sector,
  shares,
  price,
}) {
  if (!instantDb) return;
  const orderShares = clampShares(shares);
  if (!orderShares) {
    throw new Error("Share amount must be greater than zero.");
  }
  const marketPrice = Number(price) || 0;
  const currentCash = Number(portfolio?.cashReserve) || 0;
  const existing = positions.find((position) => position.symbol === symbol) || null;
  const txs = [];

  if (mode === "buy") {
    const cost = orderShares * marketPrice;
    if (cost > currentCash) {
      throw new Error("This order exceeds your available cash.");
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
          name,
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
        cashReserve: currentCash - cost,
        updatedAt: Date.now(),
      })
    );
    txs.push(
      instantDb.tx.portfolio_events[instantId()].update({
        portfolioId: portfolio.id,
        eventType: "BUY",
        symbol,
        asset: name,
        shares: orderShares,
        price: marketPrice,
        amount: cost,
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
        cashReserve: currentCash + proceeds,
        updatedAt: Date.now(),
      })
    );
    txs.push(
      instantDb.tx.portfolio_events[instantId()].update({
        portfolioId: portfolio.id,
        eventType: "SELL",
        symbol,
        asset: name,
        shares: orderShares,
        price: marketPrice,
        amount: proceeds,
        status: "Completed",
        eventAt: Date.now(),
      }).link({ portfolio: portfolio.id })
    );
  } else {
    throw new Error(`Unsupported trade mode: ${mode}`);
  }

  await instantDb.transact(txs);
}
