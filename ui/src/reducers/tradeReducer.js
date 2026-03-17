export const initialTradeState = {
  isTradeModalOpen: false,
  selectedStock: null,
  strategySplit: 60,
  showAllTransactions: false,
};

export function tradeReducer(state, action) {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.payload };
    case "SET_TRADE_MODAL_OPEN":
      return { ...state, isTradeModalOpen: action.payload };
    case "SET_SELECTED_STOCK":
      return { ...state, selectedStock: action.payload };
    case "SET_STRATEGY_SPLIT":
      return { ...state, strategySplit: action.payload };
    case "TOGGLE_SHOW_ALL_TRANSACTIONS":
      return { ...state, showAllTransactions: !state.showAllTransactions };
    default:
      return state;
  }
}
