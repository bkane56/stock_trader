/**
 * Executes AI recommendations automatically in autonomous trading mode.
 * Iterates execution_recommendations from the morning briefing during US market hours.
 * Tracks executed orders by a composite token to prevent duplicate submissions.
 */
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { isWithinUsEasternTradingHours } from "../lib/marketHours";

/** Milliseconds to wait between sequential autonomous orders to let InstantDB settle. */
const PORTFOLIO_SETTLE_MS = 280;

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{
 *   isAutonomousMode: boolean,
 *   morningBriefing: object|null,
 *   submitRecommendationOrder: Function,
 * }} options
 */
export function useAutonomousTrading({
  isAutonomousMode,
  morningBriefing,
  submitRecommendationOrder,
}) {
  const dispatch = useDispatch();
  const autonomousExecutionRef = useRef(new Set());

  useEffect(() => {
    if (!isAutonomousMode || !morningBriefing || !isWithinUsEasternTradingHours()) return;

    const recommendations = Array.isArray(morningBriefing?.execution_recommendations)
      ? morningBriefing.execution_recommendations
      : [];
    if (!recommendations.length) return;

    let isCancelled = false;

    const runAutonomousOrders = async () => {
      for (let i = 0; i < recommendations.length; i += 1) {
        if (isCancelled) break;

        const recommendation = recommendations[i];
        const recKey = String(
          recommendation?.key ||
            `${recommendation?.buy?.symbol || recommendation?.symbol || ""}:${
              recommendation?.buy?.entry_style ||
              recommendation?.entry_style ||
              "immediate"
            }`
        ).trim();
        if (!recKey) continue;

        const executionToken = `${morningBriefing.generated_at || "current"}:${recKey}`;
        if (autonomousExecutionRef.current.has(executionToken)) continue;
        autonomousExecutionRef.current.add(executionToken);

        dispatch({
          type: "SET_RECOMMENDATION_DECISION",
          payload: { key: recKey, decision: "accepted" },
        });

        if (i > 0) await waitMs(PORTFOLIO_SETTLE_MS);

        await submitRecommendationOrder({
          key: recKey,
          recommendation,
          sourceMode: "autonomous_agent",
        });
      }
    };

    runAutonomousOrders().catch(() => {
      // Keep autonomous loop resilient if a recommendation throws unexpectedly.
    });

    return () => {
      isCancelled = true;
    };
  }, [dispatch, isAutonomousMode, morningBriefing, submitRecommendationOrder]);
}
