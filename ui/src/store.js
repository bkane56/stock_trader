import { compose, legacy_createStore as createStore } from "redux";
import { rootReducer } from "./reducers";

const composeEnhancers =
  (typeof window !== "undefined" &&
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) ||
  compose;

const middlewareEnhancer = undefined;

const enhancer = middlewareEnhancer
  ? composeEnhancers(middlewareEnhancer)
  : composeEnhancers();

export const store = createStore(rootReducer, enhancer);
