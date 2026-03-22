import React from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  Zap,
  Download,
} from "lucide-react";
import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { Badge } from "../components/Badge";
import { TradingModeSelector } from "../components/TradingModeSelector";
import { getTradingMode } from "../lib/tradingModes";

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
  goToPortfolio,
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
  openCashModal,
  tradingMode,
  onTradingModeChange,
  recommendationDecisions,
  recommendationOrderStatus,
  onRecommendationDecision,
}) {
  const activeTradingMode = getTradingMode(tradingMode);
  const isAssistedMode = activeTradingMode.id === "assisted_agent";
  const holdingSymbols = new Set(
    (holdings || []).map((holding) => String(holding.symbol || "").toUpperCase())
  );
  const visibleTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 3);
  const deploymentPct =
    totalValue > 0 ? Math.min(100, (investedAmount / totalValue) * 100) : 0;
  const topActions = (morningBriefing?.holdings_actions || [])
    .filter((item) => holdingSymbols.has(String(item.symbol || "").toUpperCase()))
    .slice(0, 3);
  const topDeployIdeas = (morningBriefing?.cash_deployment_options || []).slice(
    0,
    3,
  );
  const topHoldings = [...holdings]
    .sort((a, b) => (Number(b.totalValue) || 0) - (Number(a.totalValue) || 0))
    .slice(0, 6);
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

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Trading Automation Mode
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {activeTradingMode.description}
            </p>
          </div>
          <Badge variant={activeTradingMode.id === "autonomous_agent" ? "warning" : "info"}>
            {activeTradingMode.label.toUpperCase()}
          </Badge>
        </div>
        <TradingModeSelector
          value={activeTradingMode.id}
          onChange={onTradingModeChange}
          showDescriptions={true}
        />
      </GlassCard>

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
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => openCashModal("deposit")}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowUpCircle size={14} />
                Add Cash
              </button>
              <button
                onClick={() => openCashModal("withdraw")}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowDownCircle size={14} />
                Withdraw
              </button>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Holdings Snapshot */}
        <GlassCard className="lg:col-span-2 p-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Holdings Snapshot
              </h2>
              <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Top live positions by current value
              </p>
            </div>
            <button
              onClick={goToPortfolio}
              className="px-6 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
              View Portfolio
            </button>
          </div>

          {topHoldings.length ? (
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60">
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Symbol
                    </th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Name
                    </th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      Shares
                    </th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topHoldings.map((holding) => (
                    <tr key={holding.symbol} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 text-sm font-black text-slate-900">
                        {holding.symbol}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-600">
                        {holding.name}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-500 text-right">
                        {Number(holding.shares).toFixed(2)}
                      </td>
                      <td className="px-5 py-4 text-sm font-black text-slate-900 text-right">
                        $
                        {(Number(holding.totalValue) || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-10 text-center">
              <p className="text-sm font-bold text-slate-500">
                No holdings yet. Start by placing your first trade.
              </p>
            </div>
          )}
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
                        <div
                          key={`${item.symbol}-${item.entry_style}`}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <p className="text-xs font-medium text-slate-600 leading-relaxed">
                            {item.symbol} ({item.entry_style}) - {item.thesis}
                          </p>
                          {isAssistedMode ? (
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    onRecommendationDecision?.({
                                      key: `${item.symbol}:${item.entry_style}`,
                                      decision: "accepted",
                                      recommendation: item,
                                    })
                                  }
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() =>
                                    onRecommendationDecision?.({
                                      key: `${item.symbol}:${item.entry_style}`,
                                      decision: "declined",
                                      recommendation: item,
                                    })
                                  }
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100 transition-colors"
                                >
                                  Decline
                                </button>
                              </div>
                              {(() => {
                                const recKey = `${item.symbol}:${item.entry_style}`;
                                const orderStatus = String(
                                  recommendationOrderStatus?.[recKey] || "",
                                ).toLowerCase();
                                const decision = String(
                                  recommendationDecisions?.[recKey] || "pending",
                                ).toUpperCase();
                                if (orderStatus === "submitting") {
                                  return <Badge variant="warning">SUBMITTING</Badge>;
                                }
                                if (orderStatus === "submitted") {
                                  return <Badge variant="success">ORDER SUBMITTED</Badge>;
                                }
                                if (orderStatus === "failed") {
                                  return <Badge variant="warning">ORDER FAILED</Badge>;
                                }
                                return <Badge variant="info">{decision}</Badge>;
                              })()}
                            </div>
                          ) : null}
                        </div>
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
