import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { buildClosedMarketNotice, useBriefing } from "./useBriefing";
import * as briefings from "../services/briefings";

const { mockRefreshHoldings } = vi.hoisted(() => ({
  mockRefreshHoldings: vi.fn(async (holdings) => holdings),
}));

vi.mock("../services/briefings", () => ({
  generateMorningBriefing: vi.fn(),
  fetchLatestMorningBriefing: vi.fn(),
}));

vi.mock("../services/instantdb/client", () => ({
  isInstantDbEnabled: false,
}));

vi.mock("./useMarketRefresh", () => ({
  useMarketRefresh: () => ({
    refreshHoldings: mockRefreshHoldings,
  }),
}));

describe("buildClosedMarketNotice", () => {
  it("includes the next session open date", () => {
    const notice = buildClosedMarketNotice({
      isOpen: false,
      reason: "holiday",
      nextOpenAt: new Date("2026-05-26T13:00:00.000Z"),
    });
    expect(notice.title).toBe("US markets are closed");
    expect(notice.body).toMatch(/May 26/);
  });
});

describe("useBriefing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-25T14:30:00.000Z"));
    vi.mocked(briefings.generateMorningBriefing).mockReset();
    vi.mocked(briefings.fetchLatestMorningBriefing).mockReset();
    mockRefreshHoldings.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls generate with closed-market focus on a holiday", async () => {
    vi.mocked(briefings.generateMorningBriefing).mockResolvedValue({
      macro_news_summary: "Overnight headlines",
      holdings_actions: [],
      cash_deployment_options: [],
      execution_recommendations: [],
    });

    const { result } = renderHook(() =>
      useBriefing({
        holdings: [{ symbol: "AAPL" }],
        holdingsStructureKey: "AAPL",
        cash: 1000,
        strategyGrowthPct: 60,
        strategyFixedPct: 40,
        isHydrated: true,
        isAutonomousMode: false,
        activeTradingMode: { id: "manual_user" },
        waveTiming: "1h",
        signedInUser: null,
        userCompanyNameRecords: [],
      })
    );

    await waitFor(() => expect(result.current.isBriefingLoading).toBe(false));

    expect(briefings.generateMorningBriefing).toHaveBeenCalledTimes(1);
    const call = vi.mocked(briefings.generateMorningBriefing).mock.calls[0][0];
    expect(call.focus).toMatch(/markets are currently closed/i);
    expect(call.focus).toMatch(/May 26/);
    expect(result.current.briefingNotice?.title).toBe("US markets are closed");
    expect(result.current.morningBriefing?.macro_news_summary).toBe("Overnight headlines");
  });

  it("sets connectivity error when both API calls fail on a closed day", async () => {
    vi.mocked(briefings.generateMorningBriefing).mockRejectedValue(new Error("offline"));
    vi.mocked(briefings.fetchLatestMorningBriefing).mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() =>
      useBriefing({
        holdings: [],
        holdingsStructureKey: "",
        cash: 0,
        strategyGrowthPct: 60,
        strategyFixedPct: 40,
        isHydrated: true,
        isAutonomousMode: false,
        activeTradingMode: { id: "manual_user" },
        waveTiming: "1h",
        signedInUser: null,
        userCompanyNameRecords: [],
      })
    );

    await waitFor(() => expect(result.current.isBriefingLoading).toBe(false));

    expect(result.current.briefingNotice?.title).toBe("US markets are closed");
    expect(result.current.briefingError).toMatch(/Could not reach the research service/);
    expect(result.current.morningBriefing).toBeNull();
  });
});
