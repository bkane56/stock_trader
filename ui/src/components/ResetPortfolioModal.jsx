import React from "react";
import { motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

export const ResetPortfolioModal = ({ isOpen, onClose, onConfirm, isSubmitting = false }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 16 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Confirm Portfolio Reset</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-sm font-medium text-slate-700 leading-relaxed">
            This will reset the database and cannot be recovered. Are you sure you want to
            proceed?
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="flex-1 rounded-2xl border border-rose-200 bg-rose-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Resetting..." : "Yes, Reset Database"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
