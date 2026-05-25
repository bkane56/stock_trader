import React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { useDialogA11y } from "../hooks/useDialogA11y";

export function ModalFrame({
  isOpen,
  onClose,
  title,
  titleId,
  children,
  className = "max-w-md",
  zClass = "z-[100]",
  closeDisabled = false,
  headerExtra = null,
}) {
  const dialogRef = useDialogA11y(isOpen, onClose);
  const labelledBy = titleId || "modal-title";

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm",
        zClass,
      )}
      onClick={onClose}
      aria-hidden={false}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={cn(
          "bg-white w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden outline-none dark:bg-slate-900 dark:border-slate-700",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {headerExtra}
            <h2
              id={labelledBy}
              className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 truncate"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close dialog"
            className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 dark:hover:text-slate-200"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
