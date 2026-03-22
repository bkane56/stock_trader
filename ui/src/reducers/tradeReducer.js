import {
  normalizeTradingMode,
  readPersistedTradingMode,
} from "../lib/tradingModes";

export const initialTradeState = {
  isTradeModalOpen: false,
  isCashModalOpen: false,
  cashModalMode: "deposit",
  selectedStock: null,
  showAllTransactions: false,
  tradingMode: readPersistedTradingMode(),
  recommendationDecisions: {},
  recommendationOrderStatus: {},
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
    case "SET_TRADING_MODE":
      return {
        ...state,
        tradingMode: normalizeTradingMode(action.payload),
        recommendationDecisions:
          normalizeTradingMode(action.payload) === "assisted_agent"
            ? state.recommendationDecisions
            : {},
        recommendationOrderStatus:
          normalizeTradingMode(action.payload) === "assisted_agent"
            ? state.recommendationOrderStatus
            : {},
      };
    case "SET_RECOMMENDATION_DECISION": {
      const key = String(action.payload?.key || "").trim();
      const decision = action.payload?.decision;
      if (!key || (decision !== "accepted" && decision !== "declined")) {
        return state;
      }
      return {
        ...state,
        recommendationDecisions: {
          ...state.recommendationDecisions,
          [key]: decision,
        },
      };
    }
    case "SET_RECOMMENDATION_ORDER_STATUS": {
      const key = String(action.payload?.key || "").trim();
      const status = String(action.payload?.status || "").trim().toLowerCase();
      if (
        !key ||
        !["submitting", "submitted", "failed", "pending"].includes(status)
      ) {
        return state;
      }
      return {
        ...state,
        recommendationOrderStatus: {
          ...state.recommendationOrderStatus,
          [key]: status,
        },
      };
    }
    case "CLEAR_RECOMMENDATION_DECISIONS":
      return {
        ...state,
        recommendationDecisions: {},
        recommendationOrderStatus: {},
      };
    default:
      return state;
  }
}
