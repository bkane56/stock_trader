import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownCircle, ArrowUpCircle, X } from "lucide-react";
import { cn } from "../lib/utils";

export const CashAdjustmentModal = ({
  isOpen,
  mode = "deposit",
  cash,
  onClose,
  onAdjustCashReserve,
}) => {
  const [selectedMode, setSelectedMode] = useState("deposit");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedMode(mode === "withdraw" ? "withdraw" : "deposit");
    setAmount("");
  }, [isOpen, mode]);

  const numericAmount = Number(amount);
  const invalidAmount = !Number.isFinite(numericAmount) || numericAmount <= 0;
  const insufficientCash = selectedMode === "withdraw" && numericAmount > cash;
  const disableSubmit = invalidAmount || insufficientCash;

  const estimatedCash = useMemo(() => {
    if (!Number.isFinite(numericAmount)) return cash;
    if (selectedMode === "withdraw") return cash - numericAmount;
    return cash + numericAmount;
  }, [cash, numericAmount, selectedMode]);

  const handleSubmit = () => {
    if (disableSubmit) return;
    onAdjustCashReserve({
      mode: selectedMode,
      amount: numericAmount,
    });
    onClose();
  };

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
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Adjust Cash Reserve</h2>
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
              onClick={() => setSelectedMode("deposit")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                selectedMode === "deposit"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ArrowUpCircle size={16} />
              Deposit
            </button>
            <button
              onClick={() => setSelectedMode("withdraw")}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                selectedMode === "withdraw"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ArrowDownCircle size={16} />
              Withdraw
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="block w-full rounded-2xl border-slate-200 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-2xl font-bold py-4 pl-12 pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Current Cash Reserve</span>
                <span className="font-black text-slate-900">
                  $
                  {cash.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Estimated New Cash</span>
                <span className="font-black text-slate-900">
                  $
                  {estimatedCash.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {invalidAmount && amount !== "" && (
              <p className="text-sm font-medium text-rose-600">
                Amount must be greater than zero.
              </p>
            )}
            {insufficientCash && (
              <p className="text-sm font-medium text-rose-600">
                Withdraw amount exceeds your available cash reserve.
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={disableSubmit}
              className={cn(
                "w-full py-5 text-white font-black rounded-2xl shadow-lg transition-all transform active:scale-[0.98] text-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
                selectedMode === "deposit"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
              )}
            >
              {selectedMode === "deposit" ? "Add Cash" : "Withdraw Cash"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
