import React from "react";
import { AlertTriangle } from "lucide-react";
import { DEFAULT_PORTFOLIO_CASH_USD } from "../lib/portfolioDefaults";
import { ModalFrame } from "./ModalFrame";

export const ResetPortfolioModal = ({ isOpen, onClose, onConfirm, isSubmitting = false }) => {
  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Portfolio Reset"
      className="max-w-lg"
      zClass="z-[110]"
      closeDisabled={isSubmitting}
      headerExtra={
        <div
          className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <AlertTriangle size={20} />
        </div>
      }
    >
      <div className="p-6 sm:p-8 space-y-6">
        <p className="text-sm font-medium text-slate-700 leading-relaxed dark:text-slate-300">
          This clears open positions (after your last reset) and sets cash to{" "}
          <span className="font-bold tabular-nums">
            {DEFAULT_PORTFOLIO_CASH_USD.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </span>
          . Code defaults do not change existing InstantDB balances until you confirm. This
          cannot be undone. Proceed?
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 rounded-2xl border border-rose-200 bg-rose-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Resetting..." : "Yes, Reset Database"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
};
