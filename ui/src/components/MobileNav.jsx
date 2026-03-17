import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

export function MobileNav({ items }) {
  return (
    <div className="md:hidden pb-4">
      <div className="flex items-center gap-2 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all",
                isActive
                  ? "bg-teal-50 text-teal-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              )
            }
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
