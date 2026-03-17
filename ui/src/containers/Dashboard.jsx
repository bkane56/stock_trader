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
import { currentUser } from "../mocks/currentUser";

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
}) {
  const visibleTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 3);

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
          {getGreeting()}, {currentUser.firstName}.
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
                <span className="text-sm font-black text-slate-900">35%</span>
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
                <span className="text-sm font-black text-slate-900">65%</span>
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
              <p className="text-xl font-black text-slate-900">Moderate-High</p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Target Yield
              </h3>
              <p className="text-xl font-black text-slate-900">9.5% p.a.</p>
            </div>
          </div>
        </GlassCard>

        {/* AI Insights */}
        <GlassCard className="p-8">
          <h2 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
            <Zap className="text-teal-600" fill="currentColor" size={24} />
            AI Insights
          </h2>
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-teal-50 border border-teal-100 group cursor-pointer hover:bg-teal-100/50 transition-colors">
              <p className="text-sm font-black text-teal-900 mb-1">
                New Opportunity
              </p>
              <p className="text-xs font-medium text-teal-700 leading-relaxed">
                Sustainable energy stocks showing high momentum in Q1 2026.
                Consider allocating 5% cash.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 group cursor-pointer hover:bg-blue-100/50 transition-colors">
              <p className="text-sm font-black text-blue-900 mb-1">
                Rebalance Alert
              </p>
              <p className="text-xs font-medium text-blue-700 leading-relaxed">
                Volatility in tech sector detected. Portfolio rebalancing
                scheduled for next trading session.
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
