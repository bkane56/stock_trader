import React from "react";
import { cn } from "../lib/utils";
import { TRADING_MODES, normalizeTradingMode } from "../lib/tradingModes";

export function TradingModeSelector({
  value,
  onChange,
  showDescriptions = true,
  className = "",
}) {
  const selected = normalizeTradingMode(value);
  return (
    <div className={cn("space-y-3", className)}>
      {TRADING_MODES.map((mode) => {
        const isSelected = mode.id === selected;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange?.(mode.id)}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition-all",
              isSelected
                ? "border-teal-300 bg-teal-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300",
            )}
            aria-pressed={isSelected}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-xs font-black uppercase tracking-widest",
                  isSelected ? "text-teal-700" : "text-slate-500",
                )}
              >
                {mode.label}
              </p>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  isSelected ? "bg-teal-500" : "bg-slate-300",
                )}
              />
            </div>
            {showDescriptions ? (
              <p
                className={cn(
                  "mt-1 text-xs font-medium leading-relaxed",
                  isSelected ? "text-teal-800" : "text-slate-600",
                )}
              >
                {mode.description}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
