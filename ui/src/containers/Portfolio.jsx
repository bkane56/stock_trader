import React from "react";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Plus } from "lucide-react";
import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { Badge } from "../components/Badge";
import { getTradingMode } from "../lib/tradingModes";
import {
  calculateHoldingInvestedAmount,
  calculateHoldingMarketValue,
} from "../lib/portfolioMetrics";

export function Portfolio({
  holdings,
  cash,
  totalValue,
  openTradeModal,
  openAddPurchaseModal,
  openCashModal,
  morningBriefing,
  tradingMode,
}) {
  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const activeTradingMode = getTradingMode(tradingMode);
  const activeHoldings = (holdings || []).filter(
    (holding) =>
      String(holding?.symbol || "").trim().length > 0 && (Number(holding?.shares) || 0) > 0
  );
  const investedCostBasis = activeHoldings.reduce(
    (sum, holding) => sum + calculateHoldingInvestedAmount(holding),
    0
  );
  const positionsMarketValue = activeHoldings.reduce(
    (sum, holding) => sum + calculateHoldingMarketValue(holding),
    0
  );
  const unrealizedPnl = positionsMarketValue - investedCostBasis;
  const deploymentPct =
    totalValue > 0 ? Math.min(100, (positionsMarketValue / totalValue) * 100) : 0;
  const actionsBySymbol = new Map(
    (morningBriefing?.holdings_actions || []).map((item) => [item.symbol, item]),
  );
  return (
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
            Comprehensive view of your AI-optimized investment positions.
          </p>
          <div className="mt-3">
            <Badge variant={activeTradingMode.id === "autonomous_agent" ? "warning" : "info"}>
              MODE: {activeTradingMode.label.toUpperCase()}
            </Badge>
          </div>
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
            ${formatCurrency(cash)}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Buying Power Ready for Deployment
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
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
              Withdraw Cash
            </button>
          </div>
          <div className="mt-5 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Invested Cost Basis
            </p>
            <p className="text-sm font-black text-slate-900">
              ${formatCurrency(investedCostBasis)}
            </p>
            <p className="text-[11px] font-bold text-slate-600">
              Current Market Value: ${formatCurrency(positionsMarketValue)}
            </p>
            <p
              className={`text-[11px] font-bold ${
                unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              Unrealized P/L: {unrealizedPnl >= 0 ? "+" : "-"}$
              {formatCurrency(Math.abs(unrealizedPnl))}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {deploymentPct.toFixed(1)}% currently deployed
            </p>
          </div>
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
              {holdings.map((holding) => {
                const actionSignal = actionsBySymbol.get(holding.symbol);
                return (
                  <tr
                    key={holding.symbol}
                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => openTradeModal(holding)}
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
                      ${formatCurrency(holding.totalValue)}
                    </td>
                    <td className="px-8 py-6">
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group-hover:bg-white transition-colors">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="info">
                            {holding.analysis.tag.toUpperCase()}
                          </Badge>
                          {actionSignal ? (
                            <Badge variant="warning">
                              {actionSignal.action.toUpperCase()}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs font-medium text-slate-600 leading-relaxed">
                          {actionSignal ? actionSignal.reason : holding.analysis.text}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                  ${formatCurrency(totalValue)}
                </td>
                <td className="px-8 py-6"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </GlassCard>

      <div className="flex justify-end gap-4">
        <button
          onClick={openAddPurchaseModal}
          className="px-8 py-4 rounded-2xl border-2 border-teal-600 text-teal-600 text-xs font-black uppercase tracking-widest hover:bg-teal-50 transition-all flex items-center gap-2"
        >
          <Plus size={18} />
          Trade Stocks
        </button>
        <button className="px-8 py-4 rounded-2xl border-2 border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">
          Export CSV
        </button>
        <button className="px-8 py-4 rounded-2xl bg-teal-600 text-white text-xs font-black uppercase tracking-widest hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all">
          Rebalance Portfolio
        </button>
      </div>
    </motion.div>
  );
}
