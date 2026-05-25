/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  PieChart,
  Zap,
  Briefcase,
  Settings2,
  ChevronDown,
  Info,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { MobileNav } from "./components/MobileNav";
import { InstantMagicCodeLogin } from "./components/InstantMagicCodeLogin";
import { getTradingMode, persistTradingMode, TRADING_MODES } from "./lib/tradingModes";
import { currentUser } from "./mocks/currentUser";
import { Dashboard } from "./containers/Dashboard";
import { Portfolio } from "./containers/Portfolio";
import { About } from "./containers/About";
import { fetchSymbolQuote } from "./services/marketData";
import { resolveCompanyName } from "./lib/companyNames";
import { calculatePortfolioMetrics } from "./lib/portfolioMetrics";
import { DEFAULT_PORTFOLIO_CASH_USD } from "./lib/portfolioDefaults";
import { AUTONOMOUS_MIN_CONFIDENCE, TRANSACTION_FEE_USD } from "./lib/tradingConfig";
import { instantDb, isInstantDbEnabled } from "./services/instantdb/client";
import {
  adjustCashReserve,
  executeTrade,
  filterActivePositions,
  persistStrategySplit,
  pickPortfolioData,
  resetPortfolioToCashReserve,
} from "./services/instantdb/portfolioStore";
import { usePortfolioSync } from "./hooks/usePortfolioSync";
import { useBriefing } from "./hooks/useBriefing";
import { useAutonomousTrading } from "./hooks/useAutonomousTrading";

const TradeModal = lazy(() =>
  import("./components/TradeModal").then((m) => ({ default: m.TradeModal }))
);
const CashAdjustmentModal = lazy(() =>
  import("./components/CashAdjustmentModal").then((m) => ({
    default: m.CashAdjustmentModal,
  }))
);
const ResetPortfolioModal = lazy(() =>
  import("./components/ResetPortfolioModal").then((m) => ({
    default: m.ResetPortfolioModal,
  }))
);
const StrategyBuilder = lazy(() =>
  import("./containers/StrategyBuilder").then((m) => ({
    default: m.StrategyBuilder,
  }))
);

const FALLBACK_AUTH_STATE = { isLoading: false, user: null, error: null };
const FALLBACK_QUERY_STATE = { isLoading: false, error: null, data: null };
const INSTANT_PORTFOLIO_QUERY = {
  users: {},
  portfolios: {},
  positions: {},
  portfolio_events: {},
  company_names: {},
};
const EXPERIENCE_MODES = [
  { id: "basic", label: "Basic" },
  { id: "starter", label: "Starter" },
  { id: "developer", label: "Developer" },
];
const DEFAULT_EXPERIENCE_MODE = EXPERIENCE_MODES[0].id;
const EXPERIENCE_MODE_STORAGE_KEY = "investai.experienceMode";
const WAVE_TIMING_OPTIONS = [
  { id: "realtime", label: "Real Time" },
  { id: "10m", label: "Every 10 Minutes" },
  { id: "15m", label: "Every 15 Minutes" },
  { id: "1h", label: "Every Hour" },
  { id: "4h", label: "Every 4 Hours" },
  { id: "1d", label: "Once a Day" },
];
/** Default matches autonomous briefing cadence (see VITE_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES). */
const DEFAULT_WAVE_TIMING = "15m";
const WAVE_TIMING_STORAGE_KEY = "investai.waveTiming";
const THEME_OPTIONS = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
const DEFAULT_THEME_MODE = "system";
const THEME_MODE_STORAGE_KEY = "investai.themeMode";
const AUTONOMOUS_MIN_SECURITIES = 4;
const AUTONOMOUS_MAX_SECURITIES = 10;
const AUTONOMOUS_MAX_FEE_RATIO = 0.02;

function normalizeExperienceMode(mode) {
  return EXPERIENCE_MODES.some((o) => o.id === mode) ? mode : DEFAULT_EXPERIENCE_MODE;
}

function readPersistedExperienceMode() {
  if (typeof window === "undefined") return DEFAULT_EXPERIENCE_MODE;
  try {
    return normalizeExperienceMode(
      window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY) || DEFAULT_EXPERIENCE_MODE
    );
  } catch {
    return DEFAULT_EXPERIENCE_MODE;
  }
}

function persistExperienceMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, normalizeExperienceMode(mode));
  } catch {
    // Ignore localStorage write errors.
  }
}

function normalizeWaveTiming(value) {
  return WAVE_TIMING_OPTIONS.some((o) => o.id === value) ? value : DEFAULT_WAVE_TIMING;
}

function readPersistedWaveTiming() {
  if (typeof window === "undefined") return DEFAULT_WAVE_TIMING;
  try {
    return normalizeWaveTiming(
      window.localStorage.getItem(WAVE_TIMING_STORAGE_KEY) || DEFAULT_WAVE_TIMING
    );
  } catch {
    return DEFAULT_WAVE_TIMING;
  }
}

function persistWaveTiming(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WAVE_TIMING_STORAGE_KEY, normalizeWaveTiming(value));
  } catch {
    // Ignore localStorage write errors.
  }
}

function normalizeThemeMode(value) {
  return THEME_OPTIONS.some((o) => o.id === value) ? value : DEFAULT_THEME_MODE;
}

function readPersistedThemeMode() {
  if (typeof window === "undefined") return DEFAULT_THEME_MODE;
  try {
    return normalizeThemeMode(
      window.localStorage.getItem(THEME_MODE_STORAGE_KEY) || DEFAULT_THEME_MODE
    );
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

function persistThemeMode(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, normalizeThemeMode(value));
  } catch {
    // Ignore localStorage write errors.
  }
}

export default function App() {
  const dispatch = useDispatch();
  const {
    isTradeModalOpen,
    isCashModalOpen,
    cashModalMode,
    selectedStock,
    showAllTransactions,
    tradingMode,
    recommendationDecisions,
    recommendationOrderStatus,
    recommendationOrderErrors,
  } = useSelector((state) => state.trade);
  const {
    transactions,
    holdings,
    cash,
    resetAt,
    portfolioId,
    isHydrated,
    strategyGrowthPct,
    strategyFixedPct,
    isSyncing,
    syncError,
  } = useSelector((state) => state.portfolio);

  const metrics = useMemo(
    () => calculatePortfolioMetrics(holdings, cash),
    [holdings, cash]
  );
  const holdingsStructureKey = useMemo(
    () =>
      holdings
        .map((h) => `${h.id || ""}:${String(h.symbol || "").trim().toUpperCase()}`)
        .sort()
        .join("|"),
    [holdings]
  );
  const totalValue = metrics.totalValue;
  const activeTradingMode = useMemo(() => getTradingMode(tradingMode), [tradingMode]);
  const isAutonomousMode = activeTradingMode.id === "autonomous_agent";

  const authState = isInstantDbEnabled ? instantDb.useAuth() : FALLBACK_AUTH_STATE;
  const portfolioQuery = isInstantDbEnabled
    ? instantDb.useQuery(INSTANT_PORTFOLIO_QUERY)
    : FALLBACK_QUERY_STATE;
  const signedInUser = authState.user || null;

  const location = useLocation();
  const navigate = useNavigate();
  const [isApplyingStrategy, setIsApplyingStrategy] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [experienceMode, setExperienceMode] = useState(readPersistedExperienceMode);
  const [waveTiming, setWaveTiming] = useState(readPersistedWaveTiming);
  const [themeMode, setThemeMode] = useState(readPersistedThemeMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsMenuRef = useRef(null);

  /** Latest portfolio context snapshot — avoids stale closures in back-to-back autonomous orders. */
  const portfolioTradeContextRef = useRef(null);

  // --- Custom hooks ---

  const { activePortfolioRecord, userCompanyNameRecords, activeUser } = usePortfolioSync({
    signedInUser,
    portfolioQuery,
    portfolioId,
  });

  const { morningBriefing, isBriefingLoading, briefingNotice, briefingError, setBriefingRefreshNonce } =
    useBriefing({
      holdings,
      holdingsStructureKey,
      cash,
      strategyGrowthPct,
      strategyFixedPct,
      isHydrated,
      isAutonomousMode,
      activeTradingMode,
      waveTiming,
      signedInUser,
      userCompanyNameRecords,
    });

  // Keep trade context ref current for autonomous and recommendation order handlers.
  portfolioTradeContextRef.current = {
    cash,
    totalValue,
    holdings,
    portfolioRecord: activePortfolioRecord,
    portfolioQueryData: portfolioQuery?.data ?? null,
    userCompanyNameRecords,
    signedInUser,
    portfolioQueryIsLoading: Boolean(portfolioQuery?.isLoading),
  };

  // --- Theme ---

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const shouldUseDark =
      themeMode === "dark" || (themeMode === "system" && Boolean(media.matches));
    root.classList.toggle("dark", shouldUseDark);
    root.style.colorScheme = shouldUseDark ? "dark" : "light";
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleThemeChange = (event) => {
      const root = document.documentElement;
      root.classList.toggle("dark", Boolean(event.matches));
      root.style.colorScheme = event.matches ? "dark" : "light";
    };
    media.addEventListener("change", handleThemeChange);
    return () => media.removeEventListener("change", handleThemeChange);
  }, [themeMode]);

  // --- Settings menu close-on-outside-click ---

  useEffect(() => {
    if (!isSettingsOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (!settingsMenuRef.current?.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isSettingsOpen]);

  // --- Trade execution ---

  const handleExecuteTrade = useCallback(
    async (action, options = {}) => {
      const allowAutonomous = Boolean(options?.allowAutonomous);
      if (isAutonomousMode && !allowAutonomous) {
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload:
            "Autonomous mode is active. Manual trade execution is disabled while agents run.",
        });
        return false;
      }
      if (!isInstantDbEnabled) {
        dispatch(action);
        return true;
      }

      const snap = portfolioTradeContextRef.current || {};
      const execUser = snap.signedInUser ?? signedInUser;
      const execQueryData = snap.portfolioQueryData ?? portfolioQuery.data;
      const execQueryLoading = Boolean(snap.portfolioQueryIsLoading ?? portfolioQuery.isLoading);
      const portfolioRecord = snap.portfolioRecord ?? activePortfolioRecord;
      const execTotalValue = typeof snap.totalValue === "number" ? snap.totalValue : totalValue;
      const execCash = typeof snap.cash === "number" ? snap.cash : cash;
      const execCompanyNames = snap.userCompanyNameRecords ?? userCompanyNameRecords;

      if (!execUser || execQueryLoading || !execQueryData || !portfolioRecord) {
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: "Portfolio not ready yet. Please retry in a moment.",
        });
        return false;
      }

      const { positions } = pickPortfolioData(execQueryData, portfolioRecord.id);
      const activePositions = filterActivePositions(positions, portfolioRecord.resetAt);
      const mode = action.type === "BUY_ADD_HOLDING" ? "buy" : "sell";
      const transactionFee = Math.max(
        0,
        Number(action?.payload?.transactionFee ?? TRANSACTION_FEE_USD) || 0
      );
      if (mode === "buy" && action?.payload?.enforceReserve !== false) {
        const reserveFloor = Math.max(0, Number(execTotalValue) * 0.1);
        const buyCost =
          (Number(action?.payload?.price) || 0) * (Number(action?.payload?.shares) || 0) +
          transactionFee;
        if (buyCost > Math.max(0, Number(execCash) - reserveFloor)) {
          dispatch({
            type: "SET_PORTFOLIO_SYNC_ERROR",
            payload: "Order blocked: this buy would push cash below your reserve target.",
          });
          return false;
        }
      }

      dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
      try {
        await executeTrade({
          portfolio: portfolioRecord,
          positions: activePositions,
          companyNameRecords: execCompanyNames,
          mode,
          transactionFee,
          ...action.payload,
        });
        dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
        return true;
      } catch (error) {
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: error?.message || "Unable to execute trade in InstantDB.",
        });
        return false;
      } finally {
        dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
      }
    },
    [
      activePortfolioRecord,
      cash,
      dispatch,
      isAutonomousMode,
      portfolioQuery.data,
      portfolioQuery.isLoading,
      signedInUser,
      totalValue,
      userCompanyNameRecords,
    ]
  );

  // --- Recommendation order submission ---

  const submitRecommendationOrder = useCallback(
    async ({ key, recommendation, sourceMode }) => {
      const snap = portfolioTradeContextRef.current || {};
      let tradeHoldings = Array.isArray(snap.holdings) ? snap.holdings : holdings;
      let tradeCash = typeof snap.cash === "number" ? snap.cash : cash;
      let tradeTotalValue = typeof snap.totalValue === "number" ? snap.totalValue : totalValue;

      const isAutonomousSource = sourceMode === "autonomous_agent";
      const perTradeFee = TRANSACTION_FEE_USD;
      const isSellOnly = Boolean(recommendation?.is_sell_only) && recommendation?.sell_leg;

      const resolveQuote = async (quoteSymbol) => {
        const normalized = String(quoteSymbol || "").trim().toUpperCase();
        try {
          return await fetchSymbolQuote(normalized, {
            pricingProfile: experienceMode === "basic" ? "basic" : "live",
          });
        } catch (_quoteError) {
          const rows = portfolioTradeContextRef.current?.holdings || tradeHoldings || holdings || [];
          const holdingMatch = rows.find(
            (h) => String(h?.symbol || "").toUpperCase() === normalized
          );
          if (holdingMatch && Number(holdingMatch.price) > 0) {
            return {
              symbol: normalized,
              name: holdingMatch.name || normalized,
              price: Number(holdingMatch.price),
              previous_close: Number(holdingMatch.price),
            };
          }
          throw _quoteError;
        }
      };

      if (isSellOnly) {
        const leg = recommendation.sell_leg;
        const sellSym = String(leg.symbol || "").trim().toUpperCase();
        const sellShares = Number(leg.shares) || 0;
        if (!sellSym || sellShares <= 0) {
          dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
          dispatch({
            type: "SET_RECOMMENDATION_ORDER_ERROR",
            payload: { key, error: "Invalid sell-only recommendation (symbol or shares)." },
          });
          return;
        }
        const holdingSymbols = new Set(
          (tradeHoldings || []).map((h) => String(h?.symbol || "").trim().toUpperCase()).filter(Boolean)
        );
        if (isAutonomousSource && holdingSymbols.size <= AUTONOMOUS_MIN_SECURITIES && holdingSymbols.has(sellSym)) {
          dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
          dispatch({
            type: "SET_RECOMMENDATION_ORDER_ERROR",
            payload: { key, error: `Autonomous guardrail: keep at least ${AUTONOMOUS_MIN_SECURITIES} active securities.` },
          });
          return;
        }
        try {
          dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "submitting" } });
          const sellQuote = await resolveQuote(sellSym);
          const sellMarketPrice = Number(sellQuote?.price) || 0;
          const sellPreviousClose = Number(sellQuote?.previous_close) || 0;
          const isWeekend = [0, 6].includes(new Date().getDay());
          const sellExecutionPrice = isWeekend
            ? sellPreviousClose || sellMarketPrice
            : sellMarketPrice || sellPreviousClose;
          if (!sellExecutionPrice || sellExecutionPrice <= 0) {
            throw new Error(`Price unavailable for ${sellSym}.`);
          }
          const sellHolding = (tradeHoldings || []).find(
            (h) => String(h?.symbol || "").toUpperCase() === sellSym
          );
          const resolvedSellName = resolveCompanyName(
            sellSym,
            sellHolding?.name || sellQuote?.name || sellSym
          );
          const sellPlaced = await handleExecuteTrade(
            {
              type: "SELL_HOLDING",
              payload: {
                symbol: sellSym,
                name: resolvedSellName,
                sector: String(sellHolding?.sector || "Other"),
                price: sellExecutionPrice,
                shares: sellShares,
                transactionFee: perTradeFee,
              },
            },
            { allowAutonomous: isAutonomousSource }
          );
          dispatch({
            type: "SET_RECOMMENDATION_ORDER_STATUS",
            payload: { key, status: sellPlaced ? "submitted" : "failed" },
          });
          dispatch({
            type: "SET_RECOMMENDATION_ORDER_ERROR",
            payload: {
              key,
              error: sellPlaced
                ? ""
                : `Sell was rejected for ${sellSym}. Check the sync error banner.`,
            },
          });
        } catch (error) {
          const message = error?.message || `Unable to execute sell for ${sellSym}.`;
          dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
          dispatch({ type: "SET_RECOMMENDATION_ORDER_ERROR", payload: { key, error: message } });
          dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: message });
        }
        return;
      }

      const buyRecommendation = recommendation?.buy || recommendation;
      const symbol = String(buyRecommendation?.symbol || "").trim().toUpperCase();
      if (!symbol) {
        const noSymbolError = "Unable to place recommendation order: missing ticker symbol.";
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
        dispatch({ type: "SET_RECOMMENDATION_ORDER_ERROR", payload: { key, error: noSymbolError } });
        dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: noSymbolError });
        return;
      }

      const buyConfidence = Math.max(0, Number(buyRecommendation?.confidence) || 0);
      const activeHoldingSymbols = new Set(
        (tradeHoldings || []).map((h) => String(h?.symbol || "").trim().toUpperCase()).filter(Boolean)
      );
      const wouldAddNewSymbol = !activeHoldingSymbols.has(symbol);

      if (isAutonomousSource && wouldAddNewSymbol && activeHoldingSymbols.size >= AUTONOMOUS_MAX_SECURITIES) {
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_ERROR",
          payload: { key, error: `Autonomous guardrail: max ${AUTONOMOUS_MAX_SECURITIES} active securities reached.` },
        });
        return;
      }
      if (isAutonomousSource && buyConfidence < AUTONOMOUS_MIN_CONFIDENCE) {
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "pending" } });
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_ERROR",
          payload: {
            key,
            error: `Autonomous skip: confidence ${Math.round(buyConfidence * 100)}% is below standout threshold (${Math.round(AUTONOMOUS_MIN_CONFIDENCE * 100)}%).`,
          },
        });
        return;
      }

      const sellLeg = recommendation?.sell_leg || null;
      if (isAutonomousSource && sellLeg && !wouldAddNewSymbol && activeHoldingSymbols.size <= AUTONOMOUS_MIN_SECURITIES) {
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_ERROR",
          payload: { key, error: `Autonomous guardrail: keep at least ${AUTONOMOUS_MIN_SECURITIES} active securities.` },
        });
        return;
      }

      const suggestedAmount = Number(buyRecommendation?.suggested_amount) || 0;
      const minBuyNotionalForFee = perTradeFee / AUTONOMOUS_MAX_FEE_RATIO;
      if (isAutonomousSource && suggestedAmount < minBuyNotionalForFee) {
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "pending" } });
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_ERROR",
          payload: {
            key,
            error: `Autonomous skip: suggested amount $${suggestedAmount.toFixed(2)} is too small vs $${perTradeFee.toFixed(2)} transaction fee.`,
          },
        });
        return;
      }

      try {
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "submitting" } });
        let additionalFundsFromSell = 0;

        if (sellLeg) {
          const sellSymbol = String(sellLeg.symbol || "").trim().toUpperCase();
          const sellShares = Number(sellLeg.shares) || 0;
          if (!sellSymbol || sellShares <= 0) throw new Error("Invalid sell leg in recommendation.");

          const sellQuote = await resolveQuote(sellSymbol);
          const sellMarketPrice = Number(sellQuote?.price) || 0;
          const sellPreviousClose = Number(sellQuote?.previous_close) || 0;
          const isWeekend = [0, 6].includes(new Date().getDay());
          const sellExecutionPrice = isWeekend
            ? sellPreviousClose || sellMarketPrice
            : sellMarketPrice || sellPreviousClose;
          if (!sellExecutionPrice || sellExecutionPrice <= 0) {
            throw new Error(`Price unavailable for ${sellSymbol}.`);
          }
          const sellHolding = (tradeHoldings || []).find(
            (h) => String(h?.symbol || "").toUpperCase() === sellSymbol
          );
          const resolvedSellName = resolveCompanyName(
            sellSymbol,
            sellHolding?.name || sellQuote?.name || sellSymbol
          );
          const sellPlaced = await handleExecuteTrade(
            {
              type: "SELL_HOLDING",
              payload: {
                symbol: sellSymbol,
                name: resolvedSellName,
                sector: String(sellHolding?.sector || "Other"),
                price: sellExecutionPrice,
                shares: sellShares,
                transactionFee: perTradeFee,
              },
            },
            { allowAutonomous: isAutonomousSource }
          );
          if (!sellPlaced) throw new Error(`Sell of ${sellSymbol} was rejected before buy.`);
          additionalFundsFromSell = sellExecutionPrice * sellShares - perTradeFee;

          // Refresh context after sell so the buy step reads updated cash.
          const updatedSnap = portfolioTradeContextRef.current || {};
          tradeHoldings = Array.isArray(updatedSnap.holdings) ? updatedSnap.holdings : tradeHoldings;
          tradeCash = typeof updatedSnap.cash === "number" ? updatedSnap.cash : tradeCash;
          tradeTotalValue =
            typeof updatedSnap.totalValue === "number" ? updatedSnap.totalValue : tradeTotalValue;
        }

        const quote = await resolveQuote(symbol);
        const marketPrice = Number(quote?.price) || 0;
        const previousClose = Number(quote?.previous_close) || 0;
        const isWeekend = [0, 6].includes(new Date().getDay());
        const executionPrice = isWeekend
          ? previousClose || marketPrice
          : marketPrice || previousClose;
        if (!executionPrice || executionPrice <= 0) {
          throw new Error(`Price unavailable for ${symbol}.`);
        }

        const reserveFloor = Math.max(0, Number(tradeTotalValue) * 0.1);
        const availableCash = Math.max(0, Number(tradeCash) - reserveFloor);
        const budget = Math.min(suggestedAmount || availableCash, availableCash + additionalFundsFromSell);

        const netBuyBudget = Math.max(0, budget - perTradeFee);
        const rawShares = netBuyBudget / executionPrice;
        const shares = Number(rawShares.toFixed(4));
        if (!shares || shares <= 0) throw new Error(`Calculated share size is too small for ${symbol}.`);

        const orderPlaced = await handleExecuteTrade(
          {
            type: "BUY_ADD_HOLDING",
            payload: {
              symbol,
              name: resolveCompanyName(symbol, quote?.name || symbol),
              sector: String(buyRecommendation?.sector || "Other"),
              price: executionPrice,
              shares,
              enforceReserve: false,
              transactionFee: perTradeFee,
            },
          },
          { allowAutonomous: isAutonomousSource }
        );
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_STATUS",
          payload: { key, status: orderPlaced ? "submitted" : "failed" },
        });
        dispatch({
          type: "SET_RECOMMENDATION_ORDER_ERROR",
          payload: {
            key,
            error: orderPlaced
              ? ""
              : `Order was rejected while executing ${symbol}. Check the sync error banner for details.`,
          },
        });
      } catch (error) {
        const message = error?.message || `Unable to execute accepted recommendation for ${symbol}.`;
        dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "failed" } });
        dispatch({ type: "SET_RECOMMENDATION_ORDER_ERROR", payload: { key, error: message } });
        dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: message });
      }
    },
    [
      cash,
      dispatch,
      experienceMode,
      handleExecuteTrade,
      holdings,
      totalValue,
    ]
  );

  useAutonomousTrading({ isAutonomousMode, morningBriefing, submitRecommendationOrder });

  // --- Action handlers ---

  const openTradeModal = (holding) => {
    if (isAutonomousMode) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload:
          "Autonomous mode is active. Manual trading controls are disabled while agents execute.",
      });
      return;
    }
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: true });
    dispatch({ type: "SET_SELECTED_STOCK", payload: holding });
  };
  const openAddPurchaseModal = () => {
    if (isAutonomousMode) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload:
          "Autonomous mode is active. Manual trading controls are disabled while agents execute.",
      });
      return;
    }
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: true });
    dispatch({ type: "SET_SELECTED_STOCK", payload: null });
  };
  const closeTradeModal = () => {
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: false });
    dispatch({ type: "SET_SELECTED_STOCK", payload: null });
  };
  const openCashModal = (mode) => {
    dispatch({ type: "SET_CASH_MODAL_MODE", payload: mode });
    dispatch({ type: "SET_CASH_MODAL_OPEN", payload: true });
  };
  const closeCashModal = () => dispatch({ type: "SET_CASH_MODAL_OPEN", payload: false });

  const applyStrategySplit = async (nextGrowthPct) => {
    const previousGrowthPct = strategyGrowthPct;
    dispatch({ type: "SET_STRATEGY_SPLIT", payload: nextGrowthPct });
    if (!isInstantDbEnabled || !portfolioId) return true;

    setIsApplyingStrategy(true);
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    try {
      await persistStrategySplit(portfolioId, nextGrowthPct);
      dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
      return true;
    } catch (error) {
      dispatch({ type: "SET_STRATEGY_SPLIT", payload: previousGrowthPct });
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: error?.message || "Failed to persist strategy split to InstantDB.",
      });
      return false;
    } finally {
      setIsApplyingStrategy(false);
      dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
    }
  };

  const toggleShowAllTransactions = () =>
    dispatch({ type: "TOGGLE_SHOW_ALL_TRANSACTIONS" });

  const handleTradingModeChange = (nextMode) => {
    persistTradingMode(nextMode);
    dispatch({ type: "SET_TRADING_MODE", payload: nextMode });
  };
  const handleExperienceModeChange = (nextMode) => {
    const normalized = normalizeExperienceMode(nextMode);
    setExperienceMode(normalized);
    persistExperienceMode(normalized);
  };
  const handleWaveTimingChange = (nextTiming) => {
    const normalized = normalizeWaveTiming(nextTiming);
    setWaveTiming(normalized);
    persistWaveTiming(normalized);
    setBriefingRefreshNonce((n) => n + 1);
  };
  const handleThemeModeChange = (nextTheme) => {
    const normalized = normalizeThemeMode(nextTheme);
    setThemeMode(normalized);
    persistThemeMode(normalized);
  };

  const handleRecommendationDecision = async ({ key, decision, recommendation }) => {
    dispatch({ type: "SET_RECOMMENDATION_DECISION", payload: { key, decision } });
    dispatch({ type: "SET_RECOMMENDATION_ORDER_STATUS", payload: { key, status: "pending" } });
    dispatch({ type: "SET_RECOMMENDATION_ORDER_ERROR", payload: { key, error: "" } });

    if (decision !== "accepted" || activeTradingMode.id !== "assisted_agent") return;

    await submitRecommendationOrder({ key, recommendation, sourceMode: "assisted_agent" });
  };

  const handleAdjustCashReserve = async ({ mode, amount }) => {
    const actionType = mode === "withdraw" ? "WITHDRAW_CASH_RESERVE" : "DEPOSIT_CASH_RESERVE";
    const fallbackAction = { type: actionType, payload: { amount } };
    if (!isInstantDbEnabled || !signedInUser || portfolioQuery.isLoading || !portfolioQuery.data) {
      dispatch(fallbackAction);
      return;
    }
    if (!activePortfolioRecord) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Portfolio not ready yet. Please retry in a moment.",
      });
      return;
    }
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    try {
      await adjustCashReserve({ portfolio: activePortfolioRecord, mode, amount });
      dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
    } catch (error) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: error?.message || "Unable to adjust cash reserve in InstantDB.",
      });
    } finally {
      dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
    }
  };

  const openResetPortfolioModal = () => setIsResetModalOpen(true);
  const closeResetPortfolioModal = () => setIsResetModalOpen(false);

  const handleResetPortfolio = async () => {
    if (!isInstantDbEnabled || !signedInUser || portfolioQuery.isLoading || !portfolioQuery.data) {
      dispatch({ type: "RESET_PORTFOLIO" });
      closeResetPortfolioModal();
      return;
    }
    if (!activePortfolioRecord) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Portfolio not ready yet. Please retry in a moment.",
      });
      closeResetPortfolioModal();
      return;
    }
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    try {
      const { positions: portfolioPositions } = pickPortfolioData(
        portfolioQuery.data,
        activePortfolioRecord.id
      );
      const positionIds = portfolioPositions.map((p) => p.id).filter(Boolean);
      await resetPortfolioToCashReserve({
        portfolioId: activePortfolioRecord.id,
        cashReserve: DEFAULT_PORTFOLIO_CASH_USD,
        positionIds,
      });
      dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
      closeResetPortfolioModal();
    } catch (error) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: error?.message || "Unable to reset portfolio in InstantDB.",
      });
    } finally {
      dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
    }
  };

  // --- Nav ---

  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/portfolio", label: "Portfolio", icon: Briefcase },
    { to: "/strategy", label: "Strategy Builder", icon: PieChart },
    { to: "/about", label: "About", icon: Info },
  ];

  // --- Auth guards ---

  if (isInstantDbEnabled && authState.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Loading account...
        </p>
      </div>
    );
  }

  if (isInstantDbEnabled && !signedInUser) {
    return <InstantMagicCodeLogin db={instantDb} authError={authState.error} />;
  }

  // --- Render ---

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 selection:bg-teal-100 selection:text-teal-900 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-teal-900 dark:selection:text-teal-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-slate-900 focus:shadow-lg dark:focus:bg-slate-900 dark:focus:text-slate-100"
      >
        Skip to main content
      </a>
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-teal-50/50 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-50/50 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav
        className="sticky top-0 z-50 w-full bg-white/70 backdrop-blur-md border-b border-slate-200 dark:bg-slate-900/80 dark:border-slate-800"
        aria-label="Main"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between min-h-16 md:h-20 py-3 md:py-0 items-center gap-4">
            <div className="flex items-center gap-4 md:gap-10 min-w-0">
              <button
                type="button"
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => navigate("/")}
                aria-label="Go to dashboard"
              >
                <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-200">
                  <Zap className="w-6 h-6 text-white" fill="white" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter dark:text-white">
                  InvestAI
                </span>
              </button>

              <div className="hidden md:flex items-center gap-8">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 text-sm font-bold transition-all px-3 py-2 rounded-lg",
                        isActive
                          ? "text-teal-600 bg-teal-50 dark:bg-teal-900/40"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                      )
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6 shrink-0">
              <div className="relative" ref={settingsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-expanded={isSettingsOpen}
                  aria-controls="header-settings-menu"
                  aria-haspopup="true"
                >
                  <Settings2 size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">Settings</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                {isSettingsOpen ? (
                  <div
                    id="header-settings-menu"
                    className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-slate-950/80"
                  >
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label
                          htmlFor="polygon-mode-select"
                          className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500"
                        >
                          Polygon
                        </label>
                        <select
                          id="polygon-mode-select"
                          value={experienceMode}
                          onChange={(event) => handleExperienceModeChange(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {EXPERIENCE_MODES.map((modeOption) => (
                            <option key={modeOption.id} value={modeOption.id}>
                              {modeOption.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Basic is the default experience.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="theme-mode-select"
                          className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500"
                        >
                          Theme
                        </label>
                        <select
                          id="theme-mode-select"
                          value={themeMode}
                          onChange={(event) => handleThemeModeChange(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {THEME_OPTIONS.map((themeOption) => (
                            <option key={themeOption.id} value={themeOption.id}>
                              {themeOption.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="trading-automation-select"
                          className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500"
                        >
                          Trading Automation
                        </label>
                        <select
                          id="trading-automation-select"
                          value={activeTradingMode.id}
                          onChange={(event) => handleTradingModeChange(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {TRADING_MODES.map((modeOption) => (
                            <option key={modeOption.id} value={modeOption.id}>
                              {modeOption.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="wave-timing-select"
                          className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500"
                        >
                          Wave Timing
                        </label>
                        <select
                          id="wave-timing-select"
                          value={waveTiming}
                          onChange={(event) => handleWaveTimingChange(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {WAVE_TIMING_OPTIONS.map((timingOption) => (
                            <option key={timingOption.id} value={timingOption.id}>
                              {timingOption.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          How often the app re-runs the portfolio briefing. Manual and assisted modes
                          use this schedule. Autonomous mode uses{" "}
                          <span className="font-bold text-slate-600 dark:text-slate-300">
                            VITE_AUTONOMOUS_RESEARCH_INTERVAL_MINUTES
                          </span>{" "}
                          (default 15) instead.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingsOpen(false);
                          openResetPortfolioModal();
                        }}
                        className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Reset Portfolio
                      </button>
                      {isInstantDbEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            instantDb.auth.signOut();
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors md:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Sign out
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hidden sm:flex items-center gap-4 border-l pl-4 sm:pl-6 border-slate-200 dark:border-slate-700">
                <div className="text-right hidden md:block">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {activeUser?.fullName || "Portfolio User"}
                  </p>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">
                    {activeUser?.tier || "Account"}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-slate-100">
                  <img
                    alt=""
                    src={activeUser?.avatarUrl || currentUser.avatarUrl}
                    className="w-full h-full object-cover"
                  />
                </div>
                {isInstantDbEnabled ? (
                  <button
                    type="button"
                    onClick={() => instantDb.auth.signOut()}
                    className="hidden md:block text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <MobileNav items={navItems} />
        </div>
      </nav>

      {/* Main Content */}
      <main
        id="main-content"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 relative z-10"
      >
        {(syncError || isSyncing) && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "mb-6 rounded-2xl px-5 py-4",
              isSyncing
                ? "border border-blue-200 bg-blue-50"
                : "border border-rose-200 bg-rose-50"
            )}
          >
            {isSyncing ? (
              <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
                Syncing portfolio...
              </p>
            ) : (
              <p className="text-xs font-bold uppercase tracking-widest text-rose-700">
                {syncError}
              </p>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <Dashboard
                  transactions={transactions}
                  showAllTransactions={showAllTransactions}
                  toggleShowAllTransactions={toggleShowAllTransactions}
                  goToPortfolio={() => navigate("/portfolio")}
                  openCashModal={openCashModal}
                  holdings={holdings}
                  cash={cash}
                  resetAt={resetAt}
                  investedAmount={metrics.investedAmount}
                  totalValue={totalValue}
                  strategyGrowthPct={strategyGrowthPct}
                  strategyFixedPct={strategyFixedPct}
                  user={activeUser || currentUser}
                  morningBriefing={morningBriefing}
                  isBriefingLoading={isBriefingLoading}
                  briefingNotice={briefingNotice}
                  briefingError={briefingError}
                  tradingMode={activeTradingMode.id}
                  onTradingModeChange={handleTradingModeChange}
                  recommendationDecisions={recommendationDecisions}
                  recommendationOrderStatus={recommendationOrderStatus}
                  recommendationOrderErrors={recommendationOrderErrors}
                  onRecommendationDecision={handleRecommendationDecision}
                />
              }
            />
            <Route
              path="/portfolio"
              element={
                <Portfolio
                  holdings={holdings}
                  cash={cash}
                  totalValue={totalValue}
                  openTradeModal={openTradeModal}
                  openAddPurchaseModal={openAddPurchaseModal}
                  openCashModal={openCashModal}
                  morningBriefing={morningBriefing}
                  tradingMode={activeTradingMode.id}
                />
              }
            />
            <Route
              path="/strategy"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-[400px] flex items-center justify-center text-slate-400">
                      Loading…
                    </div>
                  }
                >
                  <StrategyBuilder
                    strategySplit={strategyGrowthPct}
                    onApplyStrategy={applyStrategySplit}
                    isApplyingStrategy={isApplyingStrategy}
                  />
                </Suspense>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-20 py-12 bg-white border-t border-slate-200 dark:bg-slate-900 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center dark:bg-slate-700">
                <Zap className="w-5 h-5 text-white" fill="white" />
              </div>
              <span className="text-lg font-black text-slate-900 tracking-tighter dark:text-white">
                InvestAI
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center md:text-left max-w-md">
              Portfolio demonstration project. Not financial advice. Market data may be delayed.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <NavLink
                to="/about"
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-teal-600 dark:hover:text-teal-400"
              >
                Architecture
              </NavLink>
              <a
                href="https://github.com/bkane56/stock_trader"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-teal-600 dark:hover:text-teal-400"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {isTradeModalOpen && (
          <Suspense fallback={null}>
            <TradeModal
              isOpen={isTradeModalOpen}
              onClose={closeTradeModal}
              holding={selectedStock}
              cash={cash}
              holdings={holdings}
              morningBriefing={morningBriefing}
              tradingMode={activeTradingMode.id}
              experienceMode={experienceMode}
              onExecuteTrade={handleExecuteTrade}
            />
          </Suspense>
        )}
        {isCashModalOpen && (
          <Suspense fallback={null}>
            <CashAdjustmentModal
              isOpen={isCashModalOpen}
              mode={cashModalMode}
              cash={cash}
              onClose={closeCashModal}
              onAdjustCashReserve={handleAdjustCashReserve}
            />
          </Suspense>
        )}
        {isResetModalOpen && (
          <Suspense fallback={null}>
            <ResetPortfolioModal
              isOpen={isResetModalOpen}
              onClose={closeResetPortfolioModal}
              onConfirm={handleResetPortfolio}
              isSubmitting={isSyncing}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
