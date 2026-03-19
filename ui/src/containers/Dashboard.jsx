import React from "react";
import {
  TrendingUp,
  Wallet,
  ArrowUpRight,
  Zap,
  Download,
} from "lucide-react";
import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { Badge } from "../components/Badge";

// --- Greeting Helper ---
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
};

export function Dashboard({
  transactions,
  showAllTransactions,
  toggleShowAllTransactions,
  goToStrategy,
  holdings,
  cash,
  investedAmount,
  totalValue,
  strategyGrowthPct,
  strategyFixedPct,
  user,
  morningBriefing,
  isBriefingLoading,
  briefingError,
}) {
  const visibleTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 3);
  const deploymentPct =
    totalValue > 0 ? Math.min(100, (investedAmount / totalValue) * 100) : 0;
  const topActions = (morningBriefing?.holdings_actions || []).slice(0, 3);
  const topDeployIdeas = (morningBriefing?.cash_deployment_options || []).slice(
    0,
    3,
  );
  const generatedAt = morningBriefing?.generated_at
    ? new Date(morningBriefing.generated_at).toLocaleString()
    : "";

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-10"
    >
      <header>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">
          {getGreeting()}, {user?.firstName || "Investor"}.
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
              $
              {totalValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </h3>
            <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              <ArrowUpRight size={16} />
              {holdings.length} active positions
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
              $
              {investedAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </h3>
            <p className="text-sm font-bold text-slate-400">
              {deploymentPct.toFixed(1)}% Deployment
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
              $
              {cash.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
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
                Current AI rebalancing:{" "}
                {strategyGrowthPct >= 60 ? "Growth Tilt" : "Fixed Tilt"}
              </p>
            </div>
            <button
              onClick={goToStrategy}
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
                  {strategyFixedPct}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${strategyFixedPct}%` }}
                  className="h-full bg-teal-500 rounded-full"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <Badge variant="info">GROWTH EQUITY</Badge>
                <span className="text-sm font-black text-slate-900">
                  {strategyGrowthPct}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${strategyGrowthPct}%` }}
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
                {strategyGrowthPct >= 80
                  ? "Aggressive"
                  : strategyGrowthPct >= 60
                    ? "Moderate-High"
                    : strategyGrowthPct >= 40
                      ? "Moderate"
                      : "Conservative"}
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Target Yield
              </h3>
              <p className="text-xl font-black text-slate-900">9.5% p.a.</p>
            </div>
          </div>
        </GlassCard>

        {/* Morning Briefing */}
        <GlassCard className="p-8">
          <h2 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
            <Zap className="text-teal-600" fill="currentColor" size={24} />
            Morning Briefing
          </h2>
          <div className="space-y-6">
            {isBriefingLoading ? (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-xs font-medium text-slate-600">
                  Loading latest morning briefing...
                </p>
              </div>
            ) : null}

            {briefingError ? (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100">
                <p className="text-xs font-medium text-amber-700">
                  {briefingError}
                </p>
              </div>
            ) : null}

            {morningBriefing ? (
              <>
                <div className="p-5 rounded-2xl bg-teal-50 border border-teal-100">
                  <p className="text-sm font-black text-teal-900 mb-1">
                    Market Context
                  </p>
                  <p className="text-xs font-medium text-teal-700 leading-relaxed">
                    {morningBriefing.macro_news_summary}
                  </p>
                  {generatedAt ? (
                    <p className="text-[10px] mt-2 font-bold text-teal-700 uppercase tracking-widest">
                      Generated {generatedAt}
                    </p>
                  ) : null}
                </div>

                <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-sm font-black text-blue-900 mb-2">
                    Top Holding Actions
                  </p>
                  <div className="space-y-2">
                    {topActions.length ? (
                      topActions.map((item) => (
                        <p
                          key={`${item.symbol}-${item.action}`}
                          className="text-xs font-medium text-blue-700 leading-relaxed"
                        >
                          {item.symbol}: {item.action.toUpperCase()} (
                          {Math.round(item.confidence * 100)}%)
                        </p>
                      ))
                    ) : (
                      <p className="text-xs font-medium text-blue-700 leading-relaxed">
                        No holding action signals available.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-sm font-black text-slate-900 mb-2">
                    Cash Deployment Ideas
                  </p>
                  <div className="space-y-2">
                    {topDeployIdeas.length ? (
                      topDeployIdeas.map((item) => (
                        <p
                          key={`${item.symbol}-${item.entry_style}`}
                          className="text-xs font-medium text-slate-600 leading-relaxed"
                        >
                          {item.symbol} ({item.entry_style}) - {item.thesis}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs font-medium text-slate-600 leading-relaxed">
                        No deploy-cash candidates for current conditions.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </GlassCard>
      </div>

      {/* Transactions */}
      <GlassCard className="overflow-hidden p-0">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Recent Transactions
            <span className="ml-2 text-sm font-medium text-slate-400">
              (
              {showAllTransactions
                ? transactions.length
                : Math.min(3, transactions.length)}{" "}
              of {transactions.length})
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
                        tx.status === "Completed" ? "success" : "warning"
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
  );
}
