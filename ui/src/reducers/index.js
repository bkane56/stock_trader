import { combineReducers } from "redux";
import { portfolioReducer } from "./portfolioReducer";
import { initialTradeState, tradeReducer } from "./tradeReducer";

const trade = (state = initialTradeState, action) => tradeReducer(state, action);

export const rootReducer = combineReducers({
  trade,
  portfolio: portfolioReducer,
});
