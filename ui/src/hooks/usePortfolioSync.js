/**
 * Manages InstantDB portfolio synchronization:
 * bootstrap, seeding defaults, ownership linking, and Redux state hydration.
 */
import { useEffect, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";
import {
  buildPortfolioState,
  ensurePortfolioForUser,
  ensurePortfolioOwnershipLink,
  pickPortfolioData,
  pickUserPortfolio,
  resolveDisplayUser,
  seedPortfolioDefaultsIfEmpty,
} from "../services/instantdb/portfolioStore";
import { isInstantDbEnabled } from "../services/instantdb/client";
import { currentUser } from "../mocks/currentUser";

/**
 * @param {{
 *   signedInUser: object|null,
 *   portfolioQuery: { isLoading: boolean, error: any, data: object|null },
 *   portfolioId: string|null,
 * }} options
 * @returns {{
 *   activePortfolioRecord: object|null,
 *   userCompanyNameRecords: Array,
 *   activeUser: object,
 * }}
 */
export function usePortfolioSync({ signedInUser, portfolioQuery, portfolioId }) {
  const dispatch = useDispatch();

  const portfolioBootstrapRef = useRef(new Set());
  const portfolioSeedRef = useRef(new Set());
  const portfolioOwnerLinkRef = useRef(new Set());

  const userProfileRecord = useMemo(() => {
    if (!portfolioQuery?.data || !signedInUser) return null;
    return (
      portfolioQuery.data.users?.find(
        (u) => u.id === signedInUser.id || u.userId === signedInUser.id
      ) || null
    );
  }, [portfolioQuery?.data, signedInUser]);

  const activeUser = useMemo(
    () =>
      isInstantDbEnabled
        ? resolveDisplayUser(signedInUser, userProfileRecord)
        : currentUser,
    [signedInUser, userProfileRecord]
  );

  const activePortfolioRecord = useMemo(() => {
    if (!portfolioQuery?.data || !signedInUser) return null;

    if (portfolioId) {
      const byId =
        portfolioQuery.data.portfolios?.find((p) => p.id === portfolioId) || null;
      if (byId) return byId;
    }

    const byUser = pickUserPortfolio(portfolioQuery.data, signedInUser.id);
    if (byUser) return byUser;

    const visible = portfolioQuery.data.portfolios || [];
    if (!visible.length) return null;
    if (visible.length === 1) return visible[0];

    const positionCounts = (portfolioQuery.data.positions || []).reduce(
      (acc, p) => ({ ...acc, [p.portfolioId]: (acc[p.portfolioId] || 0) + 1 }),
      {}
    );
    const eventCounts = (portfolioQuery.data.portfolio_events || []).reduce(
      (acc, e) => ({ ...acc, [e.portfolioId]: (acc[e.portfolioId] || 0) + 1 }),
      {}
    );

    return [...visible].sort((a, b) => {
      const byPos = (positionCounts[b.id] || 0) - (positionCounts[a.id] || 0);
      if (byPos !== 0) return byPos;
      const byEvt = (eventCounts[b.id] || 0) - (eventCounts[a.id] || 0);
      if (byEvt !== 0) return byEvt;
      return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    })[0];
  }, [portfolioId, portfolioQuery?.data, signedInUser]);

  const userCompanyNameRecords = useMemo(() => {
    if (!signedInUser?.id || !portfolioQuery?.data?.company_names) return [];
    return (portfolioQuery.data.company_names || []).filter(
      (row) => row.userId === signedInUser.id
    );
  }, [portfolioQuery?.data?.company_names, signedInUser?.id]);

  // Bootstrap: create the portfolio record for new users on first login.
  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data
    )
      return;

    const visible = portfolioQuery.data.portfolios || [];
    if (visible.length || portfolioBootstrapRef.current.has(signedInUser.id)) return;

    portfolioBootstrapRef.current.add(signedInUser.id);
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    ensurePortfolioForUser(signedInUser.id)
      .then(() => dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" }))
      .catch((err) =>
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: err?.message || "Failed to create your InstantDB portfolio.",
        })
      )
      .finally(() => dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false }));
  }, [
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
    activePortfolioRecord,
  ]);

  // Seed: populate default holdings for empty portfolios.
  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data ||
      !activePortfolioRecord
    )
      return;

    const { positions, events } = pickPortfolioData(
      portfolioQuery.data,
      activePortfolioRecord.id
    );
    if (positions.length > 0) return;
    if (events.some((e) => e.eventType === "BUY" || e.eventType === "SELL")) return;
    if (portfolioSeedRef.current.has(activePortfolioRecord.id)) return;

    portfolioSeedRef.current.add(activePortfolioRecord.id);
    dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: true });
    seedPortfolioDefaultsIfEmpty(activePortfolioRecord.id, positions, events)
      .then(() => dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" }))
      .catch((err) => {
        portfolioSeedRef.current.delete(activePortfolioRecord.id);
        dispatch({
          type: "SET_PORTFOLIO_SYNC_ERROR",
          payload: err?.message || "Failed to seed default portfolio holdings.",
        });
      })
      .finally(() => dispatch({ type: "SET_PORTFOLIO_SYNCING", payload: false }));
  }, [
    activePortfolioRecord,
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
  ]);

  // Ownership link: ensure portfolio is associated with its owner.
  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !activePortfolioRecord
    )
      return;
    if (portfolioOwnerLinkRef.current.has(activePortfolioRecord.id)) return;

    portfolioOwnerLinkRef.current.add(activePortfolioRecord.id);
    ensurePortfolioOwnershipLink(activePortfolioRecord.id, signedInUser.id).catch(() => {
      portfolioOwnerLinkRef.current.delete(activePortfolioRecord.id);
    });
  }, [
    activePortfolioRecord,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
  ]);

  // Hydrate Redux portfolio state from InstantDB query data.
  useEffect(() => {
    if (
      !isInstantDbEnabled ||
      !signedInUser ||
      portfolioQuery.isLoading ||
      portfolioQuery.error ||
      !portfolioQuery.data ||
      !activePortfolioRecord
    )
      return;

    const { positions, events } = pickPortfolioData(
      portfolioQuery.data,
      activePortfolioRecord.id
    );
    const nextState = buildPortfolioState(
      activePortfolioRecord,
      positions,
      events,
      userCompanyNameRecords
    );
    dispatch({ type: "HYDRATE_PORTFOLIO", payload: nextState });
    dispatch({ type: "SET_PORTFOLIO_SYNC_ERROR", payload: "" });
  }, [
    dispatch,
    portfolioQuery.data,
    portfolioQuery.error,
    portfolioQuery.isLoading,
    signedInUser,
    activePortfolioRecord,
    userCompanyNameRecords,
  ]);

  return { activePortfolioRecord, userCompanyNameRecords, activeUser };
}
