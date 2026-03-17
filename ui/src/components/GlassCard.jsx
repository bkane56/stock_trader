import React from "react";
import { cn } from "../lib/utils";

export const GlassCard = ({ children, className, ...props }) => (
  <div
    className={cn(
      "bg-white/80 backdrop-blur-xl border border-white/30 shadow-sm rounded-2xl p-6",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
