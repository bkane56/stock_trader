import portfolioHoldings from "../data/portfolioHoldings.json";

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

export const initialState = {
  view: "dashboard",
  isTradeModalOpen: false,
  strategySplit: 60,
  showAllTransactions: false,
  transactions: allTransactions,
  holdings: portfolioHoldings,
};

export function tradeReducer(state, action) {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.payload };
    case "SET_TRADE_MODAL_OPEN":
      return { ...state, isTradeModalOpen: action.payload };
    case "SET_STRATEGY_SPLIT":
      return { ...state, strategySplit: action.payload };
    case "TOGGLE_SHOW_ALL_TRANSACTIONS":
      return { ...state, showAllTransactions: !state.showAllTransactions };
    default:
      return state;
  }
}
