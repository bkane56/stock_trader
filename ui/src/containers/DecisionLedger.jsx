import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fetchDecisionLedger } from "../services/decisionLedger";
import { GlassCard } from "../components/GlassCard";
import { Badge } from "../components/Badge";

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function DecisionLedger() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");
    fetchDecisionLedger()
      .then((rows) => {
        if (!cancelled) setEntries(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load decision ledger.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      key="decision-ledger"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      <header>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight dark:text-slate-100">
          Decision Ledger
        </h1>
        <p className="text-slate-500 font-medium mt-2 max-w-2xl">
          Auditable record of AI recommendations, risk-engine triggers, approvals, and blocked
          autonomous trades.
        </p>
      </header>

      {isLoading ? (
        <p role="status" className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Loading ledger…
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <p className="text-slate-500">No decision entries yet. Generate a briefing to populate the ledger.</p>
      ) : null}

      {!isLoading && entries.length > 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Decision ledger entries</caption>
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3">Time</th>
                  <th scope="col" className="px-4 py-3">Symbol</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Mode</th>
                  <th scope="col" className="px-4 py-3">Rule triggers</th>
                  <th scope="col" className="px-4 py-3">AI summary</th>
                  <th scope="col" className="px-4 py-3">Approved</th>
                  <th scope="col" className="px-4 py-3">Executed</th>
                  <th scope="col" className="px-4 py-3">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      {entry.symbol}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{String(entry.action || "").toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 capitalize">{entry.mode}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {(entry.rule_triggers || []).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                      {entry.ai_summary || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.approved_by_user === true
                        ? "Yes"
                        : entry.approved_by_user === false
                          ? "No"
                          : "—"}
                    </td>
                    <td className="px-4 py-3">{entry.executed ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-rose-600 dark:text-rose-400">
                      {entry.blocked_reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}
    </motion.div>
  );
}
