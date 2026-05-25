import React, { useEffect, useId, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { ModalFrame } from "./ModalFrame";

export const CashAdjustmentModal = ({
  isOpen,
  mode = "deposit",
  cash,
  onClose,
  onAdjustCashReserve,
}) => {
  const amountInputId = useId();
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

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose} title="Adjust Cash Reserve">
      <div className="p-6 sm:p-8">
        <div
          className="bg-slate-100 p-1.5 rounded-2xl flex mb-8 dark:bg-slate-800"
          role="group"
          aria-label="Adjustment type"
        >
          <button
            type="button"
            onClick={() => setSelectedMode("deposit")}
            aria-pressed={selectedMode === "deposit"}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
              selectedMode === "deposit"
                ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-300",
            )}
          >
            <ArrowUpCircle size={16} aria-hidden="true" />
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode("withdraw")}
            aria-pressed={selectedMode === "withdraw"}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
              selectedMode === "withdraw"
                ? "bg-white text-rose-600 shadow-sm dark:bg-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-300",
            )}
          >
            <ArrowDownCircle size={16} aria-hidden="true" />
            Withdraw
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor={amountInputId}
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Amount
            </label>
            <div className="relative">
              <span
                className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl"
                aria-hidden="true"
              >
                $
              </span>
              <input
                id={amountInputId}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="block w-full rounded-2xl border border-slate-200 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-300 text-2xl font-bold py-4 pl-12 pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 space-y-2 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm gap-4">
              <span className="text-slate-500 font-medium">Current Cash Reserve</span>
              <span className="font-black text-slate-900 dark:text-slate-100">
                $
                {cash.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm gap-4">
              <span className="text-slate-500 font-medium">Estimated New Cash</span>
              <span className="font-black text-slate-900 dark:text-slate-100">
                $
                {estimatedCash.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {invalidAmount && amount !== "" ? (
            <p className="text-sm font-medium text-rose-600" role="alert">
              Amount must be greater than zero.
            </p>
          ) : null}
          {insufficientCash ? (
            <p className="text-sm font-medium text-rose-600" role="alert">
              Withdraw amount exceeds your available cash reserve.
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={disableSubmit}
            className={cn(
              "w-full py-5 text-white font-black rounded-2xl shadow-lg transition-all transform active:scale-[0.98] text-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
              selectedMode === "deposit"
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                : "bg-rose-600 hover:bg-rose-700 shadow-rose-200",
            )}
          >
            {selectedMode === "deposit" ? "Add Cash" : "Withdraw Cash"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
};
