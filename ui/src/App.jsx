/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  Search,
  Bell,
  Zap,
  Briefcase,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { MobileNav } from "./components/MobileNav";
import { InstantMagicCodeLogin } from "./components/InstantMagicCodeLogin";
import { getTradingMode, persistTradingMode, TRADING_MODES } from "./lib/tradingModes";
import { currentUser } from "./mocks/currentUser";
import { Dashboard } from "./containers/Dashboard";
import { Portfolio } from "./containers/Portfolio";
import { fetchLatestMorningBriefing, generateMorningBriefing } from "./services/briefings";
import { fetchSymbolQuote } from "./services/marketData";
import { calculatePortfolioMetrics } from "./lib/portfolioMetrics";
import { instantDb, isInstantDbEnabled } from "./services/instantdb/client";
import {
  adjustCashReserve,
  buildPortfolioState,
  ensurePortfolioForUser,
  ensurePortfolioOwnershipLink,
  executeTrade,
  pickPortfolioData,
  pickUserPortfolio,
  persistStrategySplit,
  resolveDisplayUser,
  seedPortfolioDefaultsIfEmpty,
} from "./services/instantdb/portfolioStore";

const TradeModal = lazy(() =>
  import("./components/TradeModal").then((m) => ({ default: m.TradeModal }))
);
const CashAdjustmentModal = lazy(() =>
  import("./components/CashAdjustmentModal").then((m) => ({
    default: m.CashAdjustmentModal,
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
};

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
  } = useSelector((state) => state.trade);
  const {
    transactions,
    holdings,
    cash,
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
  const totalValue = metrics.totalValue;
  const activeTradingMode = useMemo(() => getTradingMode(tradingMode), [tradingMode]);
  const isAutonomousMode = activeTradingMode.id === "autonomous_agent";

  const authState = isInstantDbEnabled
    ? instantDb.useAuth()
    : FALLBACK_AUTH_STATE;
  const portfolioQuery = isInstantDbEnabled
    ? instantDb.useQuery(INSTANT_PORTFOLIO_QUERY)
    : FALLBACK_QUERY_STATE;
  const signedInUser = authState.user || null;

  const location = useLocation();
  const navigate = useNavigate();
  const [morningBriefing, setMorningBriefing] = useState(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState("");
  const [isApplyingStrategy, setIsApplyingStrategy] = useState(false);
  const portfolioBootstrapRef = useRef(new Set());
  const portfolioSeedRef = useRef(new Set());
  const portfolioOwnerLinkRef = useRef(new Set());
  const briefingRequestKeyRef = useRef("");

  const userProfileRecord = useMemo(() => {
    if (!portfolioQuery?.data || !signedInUser) return null;
    return (
      portfolioQuery.data.users?.find(
        (user) =>
          user.id === signedInUser.id || user.userId === signedInUser.id
      ) || null
    );
  }, [portfolioQuery?.data, signedInUser]);

  const activeUser = useMemo(
    () =>
      isInstantDbEnabled
        ? resolveDisplayUser(signedInUser, userProfileRecord)
        : currentUser,
    [signedInUser, userProfileRecord]
  );

  const activePortfolioRecord = useMemo(() => {
    if (!portfolioQuery?.data || !signedInUser) return null;
    if (portfolioId) {
      const byId =
        portfolioQuery.data.portfolios?.find((portfolio) => portfolio.id === portfolioId) ||
        null;
      if (byId) return byId;
    }
    const byUser = pickUserPortfolio(portfolioQuery.data, signedInUser.id);
    if (byUser) return byUser;

    const visiblePortfolios = portfolioQuery.data.portfolios || [];
    if (!visiblePortfolios.length) return null;
    if (visiblePortfolios.length === 1) return visiblePortfolios[0];

    // Prefer portfolios with holdings/events so we don't accidentally switch to a sparse record.
    const positionCounts = (portfolioQuery.data.positions || []).reduce((acc, position) => {
      acc[position.portfolioId] = (acc[position.portfolioId] || 0) + 1;
      return acc;
    }, {});
    const eventCounts = (portfolioQuery.data.portfolio_events || []).reduce((acc, event) => {
      acc[event.portfolioId] = (acc[event.portfolioId] || 0) + 1;
      return acc;
    }, {});

    const ranked = [...visiblePortfolios].sort((a, b) => {
      const byPositions = (positionCounts[b.id] || 0) - (positionCounts[a.id] || 0);
      if (byPositions !== 0) return byPositions;
      const byEvents = (eventCounts[b.id] || 0) - (eventCounts[a.id] || 0);
      if (byEvents !== 0) return byEvents;
      return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    });
    return ranked[0] || null;
  }, [portfolioId, portfolioQuery?.data, signedInUser]);

  useEffect(() => {
    let isCancelled = false;
    if (isInstantDbEnabled && !isHydrated) {
      return () => {
        isCancelled = true;
      };
    }

    const symbols = Array.from(
      new Set(
        holdings
          .map((holding) => String(holding.symbol || "").trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort();
    const requestKey = `${symbols.join(",")}::${Number(cash || 0).toFixed(2)}`;
    if (briefingRequestKeyRef.current === requestKey && morningBriefing) {
      return () => {
        isCancelled = true;
      };
    }

    briefingRequestKeyRef.current = requestKey;
    setIsBriefingLoading(true);
    generateMorningBriefing({
      holdings: symbols,
      holdingsSnapshot: holdings,
      cashAvailable: cash,
      strategyGrowthPct: strategyGrowthPct,
      strategyFixedPct: strategyFixedPct,
      persist: false,
      focus: "portfolio holdings actions and cash deployment options",
    })
      .then((payload) => {
        if (isCancelled) return;
        setMorningBriefing(payload);
        setBriefingError("");
      })
      .catch(async () => {
        if (isCancelled) return;
        try {
          const fallbackPayload = await fetchLatestMorningBriefing();
          if (isCancelled) return;
          setMorningBriefing(fallbackPayload);
          setBriefingError(
            "Live briefing unavailable. Showing latest saved briefing snapshot.",
          );
        } catch {
          if (isCancelled) return;
          setBriefingError(
            "Morning briefing unavailable. Showing local holdings data only.",
          );
        }
      })
      .finally(() => {
        if (isCancelled) return;
        setIsBriefingLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    cash,
    holdings,
    isHydrated,
    isInstantDbEnabled,
    morningBriefing,
    strategyGrowthPct,
    strategyFixedPct,
  ]);

  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data
    ) {
      return;
    }

    const visiblePortfolios = portfolioQuery.data.portfolios || [];
    if (visiblePortfolios.length || portfolioBootstrapRef.current.has(signedInUser.id)) {
      return;
    }

    portfolioBootstrapRef.current.add(signedInUser.id);
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    ensurePortfolioForUser(signedInUser.id)
      .then(() => {
        dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
      })
      .catch((error) => {
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: error?.message || "Failed to create your InstantDB portfolio.",
        });
      })
      .finally(() => {
        dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
      });
  }, [
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
    activePortfolioRecord,
  ]);

  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data ||
      !activePortfolioRecord
    ) {
      return;
    }

    const { positions, events } = pickPortfolioData(
      portfolioQuery.data,
      activePortfolioRecord.id
    );
    if (positions.length > 0) return;
    if (events.some((event) => event.eventType === "BUY" || event.eventType === "SELL")) return;
    if (portfolioSeedRef.current.has(activePortfolioRecord.id)) return;

    portfolioSeedRef.current.add(activePortfolioRecord.id);
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    seedPortfolioDefaultsIfEmpty(activePortfolioRecord.id, positions, events)
      .then(() => {
        dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
      })
      .catch((error) => {
        portfolioSeedRef.current.delete(activePortfolioRecord.id);
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: error?.message || "Failed to seed default portfolio holdings.",
        });
      })
      .finally(() => {
        dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false });
      });
  }, [
    activePortfolioRecord,
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
  ]);

  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !activePortfolioRecord
    ) {
      return;
    }
    if (portfolioOwnerLinkRef.current.has(activePortfolioRecord.id)) {
      return;
    }
    portfolioOwnerLinkRef.current.add(activePortfolioRecord.id);
    ensurePortfolioOwnershipLink(activePortfolioRecord.id, signedInUser.id).catch(() => {
      portfolioOwnerLinkRef.current.delete(activePortfolioRecord.id);
    });
  }, [
    activePortfolioRecord,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
  ]);

  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data
    ) {
      return;
    }

    const portfolioRecord = activePortfolioRecord;
    if (!portfolioRecord) return;

    const { positions, events } = pickPortfolioData(
      portfolioQuery.data,
      portfolioRecord.id
    );
    const nextState = buildPortfolioState(portfolioRecord, positions, events);
    dispatch({ type: "HYDRATE_PORTFOLIO", payload: nextState });
    dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
  }, [
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
    activePortfolioRecord,
  ]);

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
        payload:
          error?.message || "Failed to persist strategy split to InstantDB.",
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
  const handleRecommendationDecision = async ({ key, decision, recommendation }) => {
    dispatch({
      type: "SET_RECOMMENDATION_DECISION",
      payload: { key, decision },
    });

    if (decision !== "accepted" || activeTradingMode.id !== "assisted_agent") {
      return;
    }

    const buyRecommendation = recommendation?.buy || recommendation;
    const symbol = String(buyRecommendation?.symbol || "").trim().toUpperCase();
    if (!symbol) {
      dispatch({
        type: "SET_RECOMMENDATION_ORDER_STATUS",
        payload: { key, status: "failed" },
      });
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Unable to place recommendation order: missing ticker symbol.",
      });
      return;
    }

    const sellLeg = recommendation?.sell_leg || null;
    const suggestedAmount = Number(buyRecommendation?.suggested_amount) || 0;
    const resolveQuote = async (quoteSymbol) => {
      const normalized = String(quoteSymbol || "").trim().toUpperCase();
      try {
        return await fetchSymbolQuote(normalized);
      } catch (_quoteError) {
        const holdingMatch = (holdings || []).find(
          (holding) => String(holding?.symbol || "").toUpperCase() === normalized
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
    try {
      dispatch({
        type: "SET_RECOMMENDATION_ORDER_STATUS",
        payload: { key, status: "submitting" },
      });
      let additionalFundsFromSell = 0;
      if (sellLeg) {
        const sellSymbol = String(sellLeg.symbol || "").trim().toUpperCase();
        const sellShares = Number(sellLeg.shares) || 0;
        if (!sellSymbol || sellShares <= 0) {
          throw new Error("Invalid sell leg in recommendation.");
        }
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
        const sellHolding = (holdings || []).find(
          (holding) => String(holding?.symbol || "").toUpperCase() === sellSymbol
        );
        const sellPlaced = await handleExecuteTrade({
          type: "SELL_FROM_HOLDING",
          payload: {
            symbol: sellSymbol,
            name: String(sellHolding?.name || sellQuote?.name || sellSymbol),
            sector: String(sellHolding?.sector || "Other"),
            price: sellExecutionPrice,
            shares: sellShares,
          },
        });
        if (!sellPlaced) {
          throw new Error(`Unable to execute sell leg for ${sellSymbol}.`);
        }
        additionalFundsFromSell = sellShares * sellExecutionPrice;
      }
      const reserveFloor = Math.max(0, Number(totalValue) * 0.1);
      const spendableCash = Math.max(0, cash - reserveFloor);
      const budget = Math.min(
        Math.max(0, suggestedAmount),
        spendableCash + additionalFundsFromSell,
      );
      if (budget <= 0) {
        throw new Error(`No cash available to place ${symbol} recommendation order.`);
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

      const rawShares = budget / executionPrice;
      const shares = Number(rawShares.toFixed(4));
      if (!shares || shares <= 0) {
        throw new Error(`Calculated share size is too small for ${symbol}.`);
      }

      const orderPlaced = await handleExecuteTrade({
        type: "BUY_ADD_HOLDING",
        payload: {
          symbol,
          name: String(quote?.name || symbol),
          sector: String(buyRecommendation?.sector || "Other"),
          price: executionPrice,
          shares,
          enforceReserve: false,
        },
      });
      dispatch({
        type: "SET_RECOMMENDATION_ORDER_STATUS",
        payload: { key, status: orderPlaced ? "submitted" : "failed" },
      });
    } catch (error) {
      dispatch({
        type: "SET_RECOMMENDATION_ORDER_STATUS",
        payload: { key, status: "failed" },
      });
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload:
          error?.message ||
          `Unable to execute accepted recommendation for ${symbol}.`,
      });
    }
  };

  const handleExecuteTrade = async (action) => {
    if (isAutonomousMode) {
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
    if (!signedInUser || portfolioQuery.isLoading || !portfolioQuery.data) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Portfolio not ready yet. Please retry in a moment.",
      });
      return false;
    }

    const portfolioRecord = activePortfolioRecord;
    if (!portfolioRecord) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Portfolio not ready yet. Please retry in a moment.",
      });
      return false;
    }

    const { positions } = pickPortfolioData(portfolioQuery.data, portfolioRecord.id);
    const mode = action.type === "BUY_ADD_HOLDING" ? "buy" : "sell";
    if (mode === "buy" && action?.payload?.enforceReserve !== false) {
      const reserveFloor = Math.max(0, Number(totalValue) * 0.1);
      const buyCost = (Number(action?.payload?.price) || 0) * (Number(action?.payload?.shares) || 0);
      if (buyCost > Math.max(0, Number(cash) - reserveFloor)) {
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
        positions,
        mode,
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
  };
  const handleAdjustCashReserve = async ({ mode, amount }) => {
    const actionType =
      mode === "withdraw" ? "WITHDRAW_CASH_RESERVE" : "DEPOSIT_CASH_RESERVE";
    const fallbackAction = { type: actionType, payload: { amount } };
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      !portfolioQuery.data
    ) {
      dispatch(fallbackAction);
      return;
    }

    const portfolioRecord = activePortfolioRecord;
    if (!portfolioRecord) {
      dispatch({
        type: "SET_PORTFOLIO_SYNC_ERROR",
        payload: "Portfolio not ready yet. Please retry in a moment.",
      });
      return;
    }

    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    try {
      await adjustCashReserve({
        portfolio: portfolioRecord,
        mode,
        amount,
      });
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

  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/portfolio", label: "Portfolio", icon: Briefcase },
    { to: "/strategy", label: "Strategy Builder", icon: PieChart },
  ];

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

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 selection:bg-teal-100 selection:text-teal-900">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-teal-50/50 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-50/50 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full bg-white/70 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-10">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => navigate("/")}
              >
                <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-200">
                  <Zap className="w-6 h-6 text-white" fill="white" />
                </div>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">
                  InvestAI
                </span>
              </div>

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
                          ? "text-teal-600 bg-teal-50"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                      )
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Mode
                </span>
                <select
                  value={activeTradingMode.id}
                  onChange={(event) => handleTradingModeChange(event.target.value)}
                  className="border-none bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 focus:outline-none"
                >
                  {TRADING_MODES.map((modeOption) => (
                    <option key={modeOption.id} value={modeOption.id}>
                      {modeOption.shortLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-slate-400">
                <Search
                  size={20}
                  className="cursor-pointer hover:text-slate-600 transition-colors"
                />
                <Bell
                  size={20}
                  className="cursor-pointer hover:text-slate-600 transition-colors"
                />
              </div>
              <div className="flex items-center gap-4 border-l pl-6 border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-black text-slate-900">
                    {activeUser?.fullName || "Portfolio User"}
                  </p>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">
                    {activeUser?.tier || "Account"}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-slate-100">
                  <img
                    alt="User Profile"
                    src={activeUser?.avatarUrl || currentUser.avatarUrl}
                    className="w-full h-full object-cover"
                  />
                </div>
                {isInstantDbEnabled ? (
                  <button
                    onClick={() => instantDb.auth.signOut()}
                    className="hidden sm:block text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        {(syncError || isSyncing) && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              {isSyncing ? "Syncing portfolio..." : syncError}
            </p>
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
                  investedAmount={metrics.investedAmount}
                  totalValue={totalValue}
                  strategyGrowthPct={strategyGrowthPct}
                  strategyFixedPct={strategyFixedPct}
                  user={activeUser || currentUser}
                  morningBriefing={morningBriefing}
                  isBriefingLoading={isBriefingLoading}
                  briefingError={briefingError}
                  tradingMode={activeTradingMode.id}
                  onTradingModeChange={handleTradingModeChange}
                  recommendationDecisions={recommendationDecisions}
                  recommendationOrderStatus={recommendationOrderStatus}
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-20 py-12 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" fill="white" />
              </div>
              <span className="text-lg font-black text-slate-900 tracking-tighter">
                InvestAI
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center md:text-left">
              © 2026 InvestAI Technologies. All investments involve risk.
              Financial data delayed by 15 minutes.
            </p>
            <div className="flex gap-8">
              {["Privacy Policy", "Terms of Service", "Support"].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-teal-600 transition-colors"
                >
                  {link}
                </a>
              ))}
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
      </AnimatePresence>
    </div>
  );
}
