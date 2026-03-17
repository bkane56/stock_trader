import React, { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from "recharts";
import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";

export function StrategyBuilder({ strategySplit, setStrategySplit }) {
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
          Tailor your investment approach by balancing Fixed Income and Growth
          assets. Adjust the slider to see how your portfolio composition
          changes in real-time.
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
                    <span className="text-slate-300 mx-3 text-2xl">/</span>
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
                  onChange={(e) => setStrategySplit(Number(e.target.value))}
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
              Calculations based on current market valuations. Past performance
              is not indicative of future results.
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
  );
}
