/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useReducer, useMemo } from "react";
import {
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  Search,
  Bell,
  Zap,
  ShieldCheck,
  Download,
  Briefcase,
} from "lucide-react";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { GlassCard } from "./components/GlassCard";
import { Badge } from "./components/Badge";
import { TradeModal } from "./components/TradeModal";
import { tradeReducer, initialState } from "./reducers/tradeReducer";

// --- Main App ---


export default function App() {
  const [state, dispatch] = useReducer(tradeReducer, initialState);
  const { view, isTradeModalOpen, strategySplit, transactions, holdings, showAllTransactions } = state;

  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 3);

  const setView = (v) => dispatch({ type: 'SET_VIEW', payload: v });
  const setIsTradeModalOpen = (v) => dispatch({ type: 'SET_TRADE_MODAL_OPEN', payload: v });
  const setStrategySplit = (v) => dispatch({ type: 'SET_STRATEGY_SPLIT', payload: v });
  const toggleShowAllTransactions = () => dispatch({ type: 'TOGGLE_SHOW_ALL_TRANSACTIONS' });

  const strategyData = useMemo(
    () => [
      { name: "Growth Assets", value: strategySplit, color: "#3b82f6" },
      { name: "Fixed Income", value: 100 - strategySplit, color: "#64748b" },
    ],
    [strategySplit],
  );

  const riskProfile = useMemo(() => {
    if (strategySplit <= 20)
      return {
        label: "Conservative",
        desc: "Minimal exposure to market volatility. Focuses on capital preservation and steady income through high-grade bonds.",
      };
    if (strategySplit <= 40)
      return {
        label: "Moderate-Conservative",
        desc: "A defensive posture with modest growth potential. Primarily fixed income with a selective equity component.",
      };
    if (strategySplit <= 60)
      return {
        label: "Moderate",
        desc: "Balanced approach seeking a blend of income and capital appreciation across diverse asset classes.",
      };
    if (strategySplit <= 80)
      return {
        label: "Moderate-Aggressive",
        desc: "Focuses on capital appreciation with significant equity exposure. Suitable for investors with a longer time horizon.",
      };
    return {
      label: "Aggressive",
      desc: "Maximum focus on growth through full equity and alternative exposure. High potential for volatility and returns.",
    };
  }, [strategySplit]);

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
                onClick={() => setView("dashboard")}
              >
                <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-200">
                  <Zap className="w-6 h-6 text-white" fill="white" />
                </div>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">
                  InvestAI
                </span>
              </div>

              <div className="hidden md:flex items-center gap-8">
                {[
                  {
                    id: "dashboard",
                    label: "Dashboard",
                    icon: LayoutDashboard,
                  },
                  { id: "portfolio", label: "Portfolio", icon: Briefcase },
                  { id: "strategy", label: "Strategy Builder", icon: PieChart },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    className={cn(
                      "flex items-center gap-2 text-sm font-bold transition-all px-3 py-2 rounded-lg",
                      view === item.id
                        ? "text-teal-600 bg-teal-50"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
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
                    Alex Sterling
                  </p>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">
                    Premium Account
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full border-2 border-white shadow-md overflow-hidden bg-slate-100">
                  <img
                    alt="User Profile"
                    src="https://picsum.photos/seed/alex/100/100"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <header>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                  Good morning, Alex.
                </h1>
                <p className="text-slate-500 font-medium mt-2 flex items-center gap-2">
                  Your AI-driven portfolio is performing{" "}
                  <span className="text-emerald-600 font-bold">
                    4.2% above benchmark
                  </span>{" "}
                  today.
                </p>
              </header>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="group hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600">
                      Total Value
                    </span>
                    <div className="p-2 bg-teal-50 rounded-lg text-teal-600 group-hover:scale-110 transition-transform">
                      <Wallet size={20} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                      $124,500.00
                    </h3>
                    <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                      <ArrowUpRight size={16} />
                      +12.5% YoY
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="group hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Invested Amount
                    </span>
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:scale-110 transition-transform">
                      <TrendingUp size={20} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                      $98,000.00
                    </h3>
                    <p className="text-sm font-bold text-slate-400">
                      78.7% Deployment
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="group hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Cash Reserve
                    </span>
                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:scale-110 transition-transform">
                      <Download size={20} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                      $26,500.00
                    </h3>
                    <p className="text-sm font-bold text-slate-400">
                      Ready for deployment
                    </p>
                  </div>
                </GlassCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Strategy Overview */}
                <GlassCard className="lg:col-span-2 p-8">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                        Strategy Overview
                      </h2>
                      <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">
                        Current AI rebalancing: Aggressive Growth
                      </p>
                    </div>
                    <button
                      onClick={() => setView("strategy")}
                      className="px-6 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                    >
                      Modify Strategy
                    </button>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <Badge variant="info">FIXED INCOME</Badge>
                        <span className="text-sm font-black text-slate-900">
                          35%
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "35%" }}
                          className="h-full bg-teal-500 rounded-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <Badge variant="info">GROWTH EQUITY</Badge>
                        <span className="text-sm font-black text-slate-900">
                          65%
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "65%" }}
                          className="h-full bg-blue-500 rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-12">
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Risk Profile
                      </h3>
                      <p className="text-xl font-black text-slate-900">
                        Moderate-High
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Target Yield
                      </h3>
                      <p className="text-xl font-black text-slate-900">
                        9.5% p.a.
                      </p>
                    </div>
                  </div>
                </GlassCard>

                {/* AI Insights */}
                <GlassCard className="p-8">
                  <h2 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                    <Zap
                      className="text-teal-600"
                      fill="currentColor"
                      size={24}
                    />
                    AI Insights
                  </h2>
                  <div className="space-y-6">
                    <div className="p-5 rounded-2xl bg-teal-50 border border-teal-100 group cursor-pointer hover:bg-teal-100/50 transition-colors">
                      <p className="text-sm font-black text-teal-900 mb-1">
                        New Opportunity
                      </p>
                      <p className="text-xs font-medium text-teal-700 leading-relaxed">
                        Sustainable energy stocks showing high momentum in Q1
                        2026. Consider allocating 5% cash.
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 group cursor-pointer hover:bg-blue-100/50 transition-colors">
                      <p className="text-sm font-black text-blue-900 mb-1">
                        Rebalance Alert
                      </p>
                      <p className="text-xs font-medium text-blue-700 leading-relaxed">
                        Volatility in tech sector detected. Portfolio
                        rebalancing scheduled for next trading session.
                      </p>
                    </div>
                    <button className="w-full py-4 mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 border-2 border-dashed border-slate-200 rounded-2xl hover:border-slate-300 transition-all">
                      View All Reports
                    </button>
                  </div>
                </GlassCard>
              </div>

              {/* Transactions */}
              <GlassCard className="overflow-hidden p-0">
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Recent Transactions
                    <span className="ml-2 text-sm font-medium text-slate-400">
                      ({showAllTransactions ? transactions.length : Math.min(3, transactions.length)} of {transactions.length})
                    </span>
                  </h2>
                  <button
                    onClick={toggleShowAllTransactions}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors"
                  >
                    {showAllTransactions ? "Show Less" : "View All"}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Asset
                        </th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Type
                        </th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Date
                        </th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                          Amount
                        </th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleTransactions.map((tx) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50 transition-colors group"
                        >
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs text-slate-600 group-hover:bg-white transition-colors">
                                {tx.symbol}
                              </div>
                              <span className="font-bold text-slate-900">
                                {tx.asset}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-sm font-bold text-slate-500">
                            {tx.type}
                          </td>
                          <td className="px-8 py-5 text-sm font-bold text-slate-400">
                            {tx.date}
                          </td>
                          <td className="px-8 py-5 text-sm font-black text-slate-900 text-right">
                            $
                            {tx.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-8 py-5 text-right">
                            <Badge
                              variant={
                                tx.status === "Completed"
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {tx.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {view === "portfolio" && (
            <motion.div
              key="portfolio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
                <div>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                    Portfolio Holdings
                  </h1>
                  <p className="text-slate-500 font-medium mt-2">
                    Comprehensive view of your AI-optimized investment
                    positions.
                  </p>
                </div>
                <GlassCard className="min-w-[300px] p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Current Cash Reserves
                    </span>
                    <div className="p-2 bg-emerald-50 rounded-full text-emerald-600">
                      <Wallet size={18} />
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
                    $42,905.32
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Buying Power Ready for Deployment
                  </p>
                </GlassCard>
              </header>

              <GlassCard className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Stock Ticker/Name
                        </th>
                        <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Shares
                        </th>
                        <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Current Price
                        </th>
                        <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Total Value
                        </th>
                        <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/3">
                          AI Analysis
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {holdings.map((holding) => (
                        <tr
                          key={holding.symbol}
                          className="hover:bg-slate-50 transition-colors group cursor-pointer"
                          onClick={() => setIsTradeModalOpen(true)}
                        >
                          <td className="px-8 py-6 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-12 w-12 bg-teal-50 flex items-center justify-center rounded-2xl text-teal-600 font-black text-sm group-hover:bg-white transition-colors">
                                {holding.symbol}
                              </div>
                              <div className="ml-5">
                                <div className="text-sm font-black text-slate-900">
                                  {holding.name}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {holding.sector}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-bold text-slate-600">
                            {holding.shares.toFixed(2)}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-bold text-slate-600">
                            ${holding.price.toFixed(2)}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-black text-slate-900">
                            $
                            {holding.totalValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-8 py-6">
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group-hover:bg-white transition-colors">
                              <div className="mb-2">
                                <Badge variant="info">
                                  {holding.analysis.tag.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                {holding.analysis.text}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50/50">
                      <tr>
                        <td
                          className="px-8 py-6 font-black text-slate-900 text-lg"
                          colSpan={3}
                        >
                          Total Portfolio Value
                        </td>
                        <td className="px-8 py-6 text-right font-black text-slate-900 text-2xl tracking-tighter">
                          $247,294.11
                        </td>
                        <td className="px-8 py-6"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </GlassCard>

              <div className="flex justify-end gap-4">
                <button className="px-8 py-4 rounded-2xl border-2 border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
                  Export CSV
                </button>
                <button className="px-8 py-4 rounded-2xl bg-teal-600 text-white text-xs font-black uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all">
                  Rebalance Portfolio
                </button>
              </div>
            </motion.div>
          )}

          {view === "strategy" && (
            <motion.div
              key="strategy"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <header>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                  Portfolio Strategy Builder
                </h1>
                <p className="text-slate-500 font-medium mt-2 max-w-2xl">
                  Tailor your investment approach by balancing Fixed Income and
                  Growth assets. Adjust the slider to see how your portfolio
                  composition changes in real-time.
                </p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Allocation Settings */}
                <GlassCard className="lg:col-span-5 p-10 flex flex-col justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-10 tracking-tight">
                      Allocation Settings
                    </h2>
                    <div className="space-y-16">
                      <div className="space-y-6">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Asset Split
                          </label>
                          <div className="text-right">
                            <span className="text-3xl font-black text-blue-600 tracking-tighter">
                              {strategySplit}%
                            </span>
                            <span className="text-slate-300 mx-3 text-2xl">
                              /
                            </span>
                            <span className="text-3xl font-black text-slate-500 tracking-tighter">
                              {100 - strategySplit}%
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={strategySplit}
                          onChange={(e) =>
                            setStrategySplit(Number(e.target.value))
                          }
                          className="w-full h-3 bg-slate-100 rounded-full appearance-none cursor-pointer accent-teal-600"
                        />

                        <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <span>100% FIXED INCOME</span>
                          <span>100% GROWTH</span>
                        </div>
                      </div>

                      <div className="p-6 bg-teal-50 rounded-3xl border border-teal-100 space-y-3">
                        <h3 className="text-sm font-black text-teal-900 flex items-center gap-2">
                          <ShieldCheck size={18} />
                          Risk Profile: {riskProfile.label}
                        </h3>
                        <p className="text-xs font-medium text-teal-700 leading-relaxed">
                          {riskProfile.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 pt-8 border-t border-slate-100">
                    <button className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 text-lg uppercase tracking-widest">
                      Apply New Strategy
                    </button>
                    <p className="text-center text-[10px] font-bold text-slate-400 mt-6 uppercase tracking-widest leading-relaxed">
                      Calculations based on current market valuations. Past
                      performance is not indicative of future results.
                    </p>
                  </div>
                </GlassCard>

                {/* Visualizer */}
                <div className="lg:col-span-7 space-y-8">
                  <GlassCard className="p-10 flex flex-col items-center">
                    <h3 className="text-xl font-black text-slate-900 mb-12 w-full tracking-tight">
                      Visual Portfolio Composition
                    </h3>
                    <div className="relative w-80 h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={strategyData}
                            cx="50%"
                            cy="50%"
                            innerRadius={100}
                            outerRadius={130}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                            startAngle={90}
                            endAngle={-270}
                          >
                            {strategyData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ReTooltip />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Target Allocation
                        </span>
                        <span className="text-4xl font-black text-slate-900 tracking-tighter">
                          {strategySplit >= 50 ? "Growth" : "Fixed"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-12 mt-16 w-full max-w-md">
                      <div className="flex items-start gap-4">
                        <div className="w-4 h-4 rounded-full bg-blue-500 mt-1 shadow-lg shadow-blue-100" />
                        <div>
                          <span className="block text-sm font-black text-slate-900">
                            Growth Assets
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Equities, ETFs, Alts
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-4 h-4 rounded-full bg-slate-500 mt-1 shadow-lg shadow-slate-100" />
                        <div>
                          <span className="block text-sm font-black text-slate-900">
                            Fixed Income
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Bonds, Cash
                          </span>
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <GlassCard className="p-6">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Est. Annual Return
                      </span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">
                        {(3.2 + (strategySplit / 100) * 6).toFixed(1)}%
                      </span>
                    </GlassCard>
                    <GlassCard className="p-6">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Volatility (σ)
                      </span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">
                        {(4.1 + (strategySplit / 100) * 14).toFixed(1)}%
                      </span>
                    </GlassCard>
                    <GlassCard className="p-6">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Sharpe Ratio
                      </span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">
                        {(0.85 + (strategySplit / 100) * 0.3).toFixed(2)}
                      </span>
                    </GlassCard>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
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
          <TradeModal
            isOpen={isTradeModalOpen}
            onClose={() => setIsTradeModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
