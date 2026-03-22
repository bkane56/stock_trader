import { computeCashAdjustment } from "../lib/cashAdjustments";
import { resolveCompanyName } from "../lib/companyNames";
import { clampPercentage, strategyFromGrowth } from "../lib/portfolioMetrics";

const INITIAL_CASH = 250000;
const DEFAULT_GROWTH_PCT = 60;
const defaultStrategy = strategyFromGrowth(DEFAULT_GROWTH_PCT);

export const initialPortfolioState = {
  transactions: [],
  holdings: [],
  cash: INITIAL_CASH,
  resetAt: null,
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
  const resolvedName = resolveCompanyName(symbol, name);
  return [
    {
      id: nextId,
      asset: resolvedName,
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
    case "RESET_PORTFOLIO":
      return {
        ...state,
        transactions: [],
        holdings: [],
        cash: INITIAL_CASH,
        resetAt: Date.now(),
        strategyGrowthPct: defaultStrategy.strategyGrowthPct,
        strategyFixedPct: defaultStrategy.strategyFixedPct,
        syncError: "",
      };
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
      const holdingsMarketValue = state.holdings.reduce(
        (sum, holding) => sum + (Number(holding.totalValue) || Number(holding.shares) * Number(holding.price) || 0),
        0
      );
      const reserveFloor = (state.cash + holdingsMarketValue) * 0.1;
      if (state.cash - cost < reserveFloor) return state;

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
              name: resolveCompanyName(symbol, name),
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
    case "DEPOSIT_CASH_RESERVE": {
      let adjustment;
      try {
        adjustment = computeCashAdjustment({
          currentCash: state.cash,
          mode: "deposit",
          amount: action.payload?.amount,
        });
      } catch {
        return state;
      }
      return {
        ...state,
        cash: adjustment.nextCash,
        syncError: "",
        transactions: addTransaction(
          state.transactions,
          adjustment.eventSymbol,
          adjustment.eventAsset,
          adjustment.transactionType,
          adjustment.normalizedAmount
        ),
      };
    }
    case "WITHDRAW_CASH_RESERVE": {
      let adjustment;
      try {
        adjustment = computeCashAdjustment({
          currentCash: state.cash,
          mode: "withdraw",
          amount: action.payload?.amount,
        });
      } catch {
        return state;
      }
      return {
        ...state,
        cash: adjustment.nextCash,
        syncError: "",
        transactions: addTransaction(
          state.transactions,
          adjustment.eventSymbol,
          adjustment.eventAsset,
          adjustment.transactionType,
          adjustment.normalizedAmount
        ),
      };
    }
    default:
      return state;
  }
}
