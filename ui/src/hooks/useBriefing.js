/**
 * Manages morning briefing lifecycle: interval-based refresh scheduling,
 * AI briefing generation, and company-name sync to InstantDB.
 */
import { useEffect, useRef, useState } from "react";
import { registerCompanyNames } from "../lib/companyNames";
import {
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

/** Convert a wave timing id to its millisecond interval. */
function waveTimingToMs(value) {
  return WAVE_TIMING_MS[value] ?? 3_600_000;
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

    if (isAutonomousMode && !isWithinUsEasternTradingHours()) {
      setIsBriefingLoading(false);
      setBriefingError(
        `Autonomous mode is paused outside US market hours (${US_EASTERN_TRADING_HOURS_LABEL}).`
      );
      return () => {
        isCancelled = true;
      };
    }

    briefingRequestKeyRef.current = requestKey;
    setIsBriefingLoading(true);

    (async () => {
      const snapshotHoldings = await refreshHoldings(currentHoldings);
      if (isCancelled) return;

      try {
        const payload = await generateMorningBriefing({
          holdings: symbols,
          holdingsSnapshot: snapshotHoldings,
          cashAvailable: cash,
          strategyGrowthPct,
          strategyFixedPct,
          persist: false,
          tradingMode: activeTradingMode.id,
          focus: "portfolio holdings actions and cash deployment options",
        });
        if (!isCancelled) {
          setMorningBriefing(payload);
          setBriefingError("");
        }
      } catch {
        if (isCancelled) return;
        try {
          const fallback = await fetchLatestMorningBriefing();
          if (!isCancelled) {
            setMorningBriefing(fallback);
            setBriefingError(
              "Live briefing unavailable. Showing latest saved briefing snapshot."
            );
          }
        } catch {
          if (!isCancelled)
            setBriefingError(
              "Morning briefing unavailable. Showing local holdings data only."
            );
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
    briefingError,
    briefingRefreshNonce,
    setBriefingRefreshNonce,
  };
}
