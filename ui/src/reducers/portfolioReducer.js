import portfolioHoldings from "../data/portfolioHoldings.json";
import { clampPercentage, strategyFromGrowth } from "../lib/portfolioMetrics";

const INITIAL_CASH = 42905.32;
const DEFAULT_GROWTH_PCT = 60;
const defaultStrategy = strategyFromGrowth(DEFAULT_GROWTH_PCT);

/**
 * Derive transactions from portfolio holdings using their dateAcquired field.
 * Each holding's initial purchase is represented as a "Buy Order" transaction.
 * Transactions are sorted most-recent-first.
 */
function holdingsToTransactions(holdings) {
  return holdings
    .map((h, i) => ({
      id: String(i + 1),
      asset: h.name,
      symbol: h.symbol,
      type: "Buy Order",
      date: new Date(h.dateAcquired).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      dateAcquired: h.dateAcquired,
      amount: h.totalValue,
      status: "Completed",
    }))
    .sort((a, b) => new Date(b.dateAcquired) - new Date(a.dateAcquired));
}

const allTransactions = holdingsToTransactions(portfolioHoldings);

export const initialPortfolioState = {
  transactions: allTransactions,
  holdings: portfolioHoldings,
  cash: INITIAL_CASH,
  strategyGrowthPct: defaultStrategy.strategyGrowthPct,
  strategyFixedPct: defaultStrategy.strategyFixedPct,
  portfolioId: null,
  isHydrated: false,
  isSyncing: false,
  syncError: "",
};

function addTransaction(transactions, symbol, name, type, amount, shares) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const nextId = String(
    Math.max(0, ...transactions.map((t) => parseInt(t.id, 10))) + 1
  );
  return [
    {
      id: nextId,
      asset: name,
      symbol,
      type,
      date: dateStr,
      dateAcquired: now.toISOString(),
      amount,
      shares,
      status: "Completed",
    },
    ...transactions,
  ];
}

export function portfolioReducer(state = initialPortfolioState, action) {
  switch (action.type) {
    case "HYDRATE_PORTFOLIO": {
      return {
        ...state,
        ...action.payload,
        isHydrated: true,
        syncError: "",
      };
    }
    case "SET_PORTFOLIO_SYNCING":
      return { ...state, isSyncing: Boolean(action.payload) };
    case "SET_PORTFOLIO_SYNC_ERROR":
      return { ...state, syncError: action.payload || "", isSyncing: false };
    case "SET_STRATEGY_SPLIT": {
      const growthPct = clampPercentage(action.payload);
      const strategy = strategyFromGrowth(growthPct);
      return { ...state, ...strategy };
    }
    case "BUY_ADD_HOLDING": {
      const { symbol, name, sector, price, shares } = action.payload;
      const cost = price * shares;
      if (state.cash < cost) return state;

      const existing = state.holdings.find((h) => h.symbol === symbol);
      const newHoldings = existing
        ? state.holdings.map((h) =>
            h.symbol === symbol
              ? {
                  ...h,
                  shares: h.shares + shares,
                  totalValue: (h.shares + shares) * h.price,
                }
              : h
          )
        : [
            ...state.holdings,
            {
              symbol,
              name,
              sector: sector || "Other",
              shares,
              price,
              totalValue: price * shares,
              dateAcquired: new Date().toISOString().slice(0, 10),
              analysis: {
                tag: "New Position",
                text: "Recently added to portfolio.",
              },
            },
          ];

      return {
        ...state,
        holdings: newHoldings,
        cash: state.cash - cost,
        syncError: "",
        transactions: addTransaction(
          state.transactions,
          symbol,
          name,
          "Buy Order",
          cost,
          shares
        ),
      };
    }
    case "SELL_HOLDING": {
      const { symbol, shares, price, name } = action.payload;
      const holding = state.holdings.find((h) => h.symbol === symbol);
      if (!holding || holding.shares < shares) return state;

      const proceeds = price * shares;
      const newHoldings =
        holding.shares === shares
          ? state.holdings.filter((h) => h.symbol !== symbol)
          : state.holdings.map((h) =>
              h.symbol === symbol
                ? {
                    ...h,
                    shares: h.shares - shares,
                    totalValue: (h.shares - shares) * h.price,
                  }
                : h
            );

      return {
        ...state,
        holdings: newHoldings,
        cash: state.cash + proceeds,
        syncError: "",
        transactions: addTransaction(
          state.transactions,
          symbol,
          name,
          "Sell Order",
          proceeds,
          shares
        ),
      };
    }
    default:
      return state;
  }
}
