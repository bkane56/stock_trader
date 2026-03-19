/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useState } from "react";
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
import { currentUser } from "./mocks/currentUser";
import { Dashboard } from "./containers/Dashboard";
import { Portfolio } from "./containers/Portfolio";
import { fetchLatestMorningBriefing } from "./services/briefings";

const TradeModal = lazy(() =>
  import("./components/TradeModal").then((m) => ({ default: m.TradeModal }))
);
const StrategyBuilder = lazy(() =>
  import("./containers/StrategyBuilder").then((m) => ({
    default: m.StrategyBuilder,
  }))
);

export default function App() {
  const dispatch = useDispatch();
  const {
    isTradeModalOpen,
    selectedStock,
    strategySplit,
    showAllTransactions,
  } = useSelector((state) => state.trade);
  const { transactions, holdings, cash } = useSelector(
    (state) => state.portfolio
  );
  const totalValue = holdings.reduce((sum, h) => sum + h.totalValue, 0);
  const location = useLocation();
  const navigate = useNavigate();
  const [morningBriefing, setMorningBriefing] = useState(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState("");

  useEffect(() => {
    let isCancelled = false;
    setIsBriefingLoading(true);
    fetchLatestMorningBriefing()
      .then((payload) => {
        if (isCancelled) return;
        setMorningBriefing(payload);
        setBriefingError("");
      })
      .catch(() => {
        if (isCancelled) return;
        setBriefingError(
          "Morning briefing unavailable. Showing local holdings data only.",
        );
      })
      .finally(() => {
        if (isCancelled) return;
        setIsBriefingLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const openTradeModal = (holding) => {
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: true });
    dispatch({ type: "SET_SELECTED_STOCK", payload: holding });
  };
  const openAddPurchaseModal = () => {
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: true });
    dispatch({ type: "SET_SELECTED_STOCK", payload: null });
  };
  const closeTradeModal = () => {
    dispatch({ type: "SET_TRADE_MODAL_OPEN", payload: false });
    dispatch({ type: "SET_SELECTED_STOCK", payload: null });
  };
  const setStrategySplit = (v) =>
    dispatch({ type: "SET_STRATEGY_SPLIT", payload: v });
  const toggleShowAllTransactions = () =>
    dispatch({ type: "TOGGLE_SHOW_ALL_TRANSACTIONS" });
  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/portfolio", label: "Portfolio", icon: Briefcase },
    { to: "/strategy", label: "Strategy Builder", icon: PieChart },
  ];

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
                    {currentUser.fullName}
                  </p>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">
                    {currentUser.tier}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-slate-100">
                  <img
                    alt="User Profile"
                    src={currentUser.avatarUrl}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
          <MobileNav items={navItems} />
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <Dashboard
                  transactions={transactions}
                  showAllTransactions={showAllTransactions}
                  toggleShowAllTransactions={toggleShowAllTransactions}
                  goToStrategy={() => navigate("/strategy")}
                  holdings={holdings}
                  cash={cash}
                  totalValue={totalValue}
                  morningBriefing={morningBriefing}
                  isBriefingLoading={isBriefingLoading}
                  briefingError={briefingError}
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
                  morningBriefing={morningBriefing}
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
                    strategySplit={strategySplit}
                    setStrategySplit={setStrategySplit}
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
              onExecuteTrade={(action) => dispatch(action)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
