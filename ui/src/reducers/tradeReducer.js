export const initialTradeState = {
  isTradeModalOpen: false,
  isCashModalOpen: false,
  cashModalMode: "deposit",
  selectedStock: null,
  showAllTransactions: false,
};

export function tradeReducer(state, action) {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.payload };
    case "SET_TRADE_MODAL_OPEN":
      return { ...state, isTradeModalOpen: action.payload };
    case "SET_CASH_MODAL_OPEN":
      return { ...state, isCashModalOpen: Boolean(action.payload) };
    case "SET_CASH_MODAL_MODE":
      return {
        ...state,
        cashModalMode: action.payload === "withdraw" ? "withdraw" : "deposit",
      };
    case "SET_SELECTED_STOCK":
      return { ...state, selectedStock: action.payload };
    case "TOGGLE_SHOW_ALL_TRANSACTIONS":
      return { ...state, showAllTransactions: !state.showAllTransactions };
    default:
      return state;
  }
}
