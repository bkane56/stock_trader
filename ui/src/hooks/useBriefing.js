/**
 * Manages morning briefing lifecycle: interval-based refresh scheduling,
 * AI briefing generation, and company-name sync to InstantDB.
 */
import { useEffect, useRef, useState } from "react";
import { registerCompanyNames } from "../lib/companyNames";
import {
  formatNextMarketOpenLabel,
  getUsMarketStatus,
  isWithinUsEasternTradingHours,
  US_EASTERN_TRADING_HOURS_LABEL,
} from "../lib/marketHours";
import {
  generateMorningBriefing,
  fetchLatestMorningBriefing,
} from "../services/briefings";
import { upsertCompanyNamesForUser } from "../services/instantdb/portfolioStore";
import { isInstantDbEnabled } from "../services/instantdb/client";
import { AUTONOMOUS_RESEARCH_INTERVAL_MS } from "../lib/portfolioDefaults";
import { useMarketRefresh } from "./useMarketRefresh";

const WAVE_TIMING_MS = {
  realtime: 60_000,
  "10m": 600_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

const CLOSED_REASON_LABELS = {
  weekend: "for the weekend",
  holiday: "for a US market holiday",
  before_hours: "before the regular session",
  after_hours: "after the regular session",
};

/** Convert a wave timing id to its millisecond interval. */
function waveTimingToMs(value) {
  return WAVE_TIMING_MS[value] ?? 3_600_000;
}

/** Build research focus when the US equity session is closed. */
function buildClosedMarketFocus(symbols, marketStatus) {
  const nextOpenLabel = formatNextMarketOpenLabel(marketStatus.nextOpenAt);
  const closedReason =
    CLOSED_REASON_LABELS[marketStatus.reason] || "while markets are closed";
  const holdingsText = symbols.length
    ? `Portfolio symbols: ${symbols.join(", ")}.`
    : "No portfolio symbols held.";

  return (
    `US equity markets are currently closed (${closedReason}). ` +
    "Gather macro news, overnight developments, and portfolio-relevant headlines. " +
    "Do not assume live prices or same-day execution. " +
    `Summarize what to watch when the regular session reopens on ${nextOpenLabel}. ` +
    holdingsText
  );
}

/** Informational banner copy when the session is closed. */
export function buildClosedMarketNotice(marketStatus) {
  const nextOpenLabel = formatNextMarketOpenLabel(marketStatus.nextOpenAt);
  return {
    title: "US markets are closed",
    body:
      `Fresh execution signals wait for the regular session. ` +
      `The following is relevant news and context to review before the market opens on ${nextOpenLabel}.`,
  };
}

/**
 * @param {{
 *   holdings: Array,
 *   holdingsStructureKey: string,
 *   cash: number,
 *   strategyGrowthPct: number,
 *   strategyFixedPct: number,
 *   isHydrated: boolean,
 *   isAutonomousMode: boolean,
 *   activeTradingMode: { id: string },
 *   waveTiming: string,
 *   signedInUser: object|null,
 *   userCompanyNameRecords: Array,
 * }} options
 * @returns {{
 *   morningBriefing: object|null,
 *   isBriefingLoading: boolean,
 *   briefingNotice: { title: string, body: string }|null,
 *   briefingError: string,
 *   briefingRefreshNonce: number,
 *   setBriefingRefreshNonce: Function,
 * }}
 */
export function useBriefing({
  holdings,
  holdingsStructureKey,
  cash,
  strategyGrowthPct,
  strategyFixedPct,
  isHydrated,
  isAutonomousMode,
  activeTradingMode,
  waveTiming,
  signedInUser,
  userCompanyNameRecords,
}) {
  const [morningBriefing, setMorningBriefing] = useState(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(true);
  const [briefingNotice, setBriefingNotice] = useState(null);
  const [briefingError, setBriefingError] = useState("");
  const [briefingRefreshNonce, setBriefingRefreshNonce] = useState(0);

  const briefingRequestKeyRef = useRef("");
  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;

  const { refreshHoldings } = useMarketRefresh();

  // Trigger periodic briefing refresh based on wave timing or autonomous cadence.
  useEffect(() => {
    const intervalMs = isAutonomousMode
      ? AUTONOMOUS_RESEARCH_INTERVAL_MS
      : waveTimingToMs(waveTiming);
    const id = window.setInterval(
      () => setBriefingRefreshNonce((n) => n + 1),
      intervalMs
    );
    return () => window.clearInterval(id);
  }, [isAutonomousMode, waveTiming]);

  // Fetch (or re-fetch) the morning briefing.
  useEffect(() => {
    let isCancelled = false;

    if (isInstantDbEnabled && !isHydrated) {
      return () => {
        isCancelled = true;
      };
    }

    const currentHoldings = holdingsRef.current;
    const symbols = Array.from(
      new Set(
        currentHoldings
          .map((h) => String(h.symbol || "").trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort();
    const requestKey = `${symbols.join(",")}::${Number(cash || 0).toFixed(2)}::${waveTiming}::${briefingRefreshNonce}`;

    if (briefingRequestKeyRef.current === requestKey && morningBriefing) {
      return () => {
        isCancelled = true;
      };
    }

    const marketStatus = getUsMarketStatus();
    const sessionClosed = !marketStatus.isOpen;
    const closedNotice = sessionClosed ? buildClosedMarketNotice(marketStatus) : null;

    if (isAutonomousMode && !isWithinUsEasternTradingHours()) {
      setIsBriefingLoading(false);
      setBriefingNotice(null);
      setBriefingError(
        `Autonomous mode is paused outside US market hours (${US_EASTERN_TRADING_HOURS_LABEL}).`
      );
      return () => {
        isCancelled = true;
      };
    }

    briefingRequestKeyRef.current = requestKey;
    setIsBriefingLoading(true);
    setBriefingNotice(null);
    setBriefingError("");

    (async () => {
      const snapshotHoldings = await refreshHoldings(currentHoldings);
      if (isCancelled) return;

      const focus = sessionClosed
        ? buildClosedMarketFocus(symbols, marketStatus)
        : "portfolio holdings actions and cash deployment options";

      try {
        const payload = await generateMorningBriefing({
          holdings: symbols,
          holdingsSnapshot: snapshotHoldings,
          cashAvailable: cash,
          strategyGrowthPct,
          strategyFixedPct,
          persist: false,
          tradingMode: activeTradingMode.id,
          focus,
        });
        if (!isCancelled) {
          setMorningBriefing(payload);
          setBriefingNotice(closedNotice);
          setBriefingError("");
        }
      } catch {
        if (isCancelled) return;
        try {
          const fallback = await fetchLatestMorningBriefing();
          if (!isCancelled) {
            setMorningBriefing(fallback);
            setBriefingNotice(closedNotice);
            if (sessionClosed) {
              setBriefingError(
                "Live refresh could not complete. Showing the latest saved research snapshot."
              );
            } else {
              setBriefingError(
                "Live briefing unavailable. Showing latest saved briefing snapshot."
              );
            }
          }
        } catch {
          if (!isCancelled) {
            setMorningBriefing(null);
            setBriefingNotice(closedNotice);
            setBriefingError(
              sessionClosed
                ? "Could not reach the research service. Showing local holdings data only."
                : "Morning briefing unavailable. Showing local holdings data only."
            );
          }
        }
      } finally {
        if (!isCancelled) setIsBriefingLoading(false);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    briefingRefreshNonce,
    cash,
    holdingsStructureKey,
    isHydrated,
    isAutonomousMode,
    waveTiming,
    strategyGrowthPct,
    strategyFixedPct,
    activeTradingMode.id,
    refreshHoldings,
  ]);

  // Register company names from latest briefing into local cache and InstantDB.
  useEffect(() => {
    if (!morningBriefing) return;

    const candidates = [];
    (morningBriefing.cash_deployment_options || []).forEach((idea) =>
      candidates.push({ symbol: idea?.symbol, name: idea?.name })
    );
    (morningBriefing.execution_recommendations || []).forEach((row) => {
      if (row?.buy) candidates.push({ symbol: row.buy?.symbol, name: row.buy?.name });
      if (row?.sell_leg)
        candidates.push({ symbol: row.sell_leg?.symbol, name: row.sell_leg?.name });
    });

    registerCompanyNames(candidates);

    if (isInstantDbEnabled && signedInUser?.id) {
      upsertCompanyNamesForUser(
        signedInUser.id,
        candidates,
        userCompanyNameRecords
      ).catch(() => {});
    }
  }, [morningBriefing, signedInUser?.id, userCompanyNameRecords]);

  return {
    morningBriefing,
    isBriefingLoading,
    briefingNotice,
    briefingError,
    briefingRefreshNonce,
    setBriefingRefreshNonce,
  };
}
