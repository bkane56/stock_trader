import React, { useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export const TradeModal = ({ isOpen, onClose, stock }) => {
  const [mode, setMode] = useState("buy");
  const [shares, setShares] = useState("0");
  const price = 172.45;
  const cash = 14250.32;
  const owned = 12;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Trade Stock</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex mb-8">
            <button
              onClick={() => setMode("buy")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all",
                mode === "buy"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Buy
            </button>
            <button
              onClick={() => setMode("sell")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all",
                mode === "sell"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Sell
            </button>
          </div>

          <div className="mb-8 flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl">
                {stock || "TSLA"}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Tesla, Inc.</h3>
                <p className="text-sm font-medium text-slate-500">
                  ${price}{" "}
                  <span className="text-rose-500 font-bold">-0.82%</span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Number of Shares
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="block w-full rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-2xl font-bold py-4 px-6"
                  placeholder="0"
                />

                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm tracking-widest">
                  SHARES
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm px-1">
              <div>
                <span className="text-slate-500 font-medium">
                  {mode === "buy" ? "Available Cash:" : "Available Shares:"}
                </span>
                <span className="font-bold text-slate-900 ml-2">
                  {mode === "buy"
                    ? `$${cash.toLocaleString()}`
                    : `${owned} TSLA`}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-medium">Est. Total:</span>
                <span className="font-black text-slate-900 ml-2">
                  $
                  {(Number(shares) * price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            <button
              className={cn(
                "w-full py-5 text-white font-black rounded-2xl shadow-lg transition-all transform active:scale-[0.98] text-lg",
                mode === "buy"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-200",
              )}
            >
              Place {mode === "buy" ? "Buy" : "Sell"} Order
            </button>
          </div>

          <p className="text-center text-[10px] font-bold text-slate-400 mt-8 px-6 uppercase tracking-widest leading-relaxed">
            Orders placed after market hours will be executed at the opening
            price of the next trading day.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};
