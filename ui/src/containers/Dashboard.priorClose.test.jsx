/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

vi.mock("../components/GlassCard", () => ({
  GlassCard: ({ children, className }) => <div className={className}>{children}</div>,
}));
vi.mock("../components/Badge", () => ({
  Badge: ({ children }) => <span>{children}</span>,
}));
vi.mock("../components/TradingModeSelector", () => ({
  TradingModeSelector: () => <div>Trading mode selector</div>,
}));
vi.mock("../lib/tradingModes", () => ({
  getTradingMode: () => ({
    id: "manual_user",
    label: "Manual",
    description: "Manual mode",
  }),
}));
vi.mock("../lib/formatCurrency", () => ({
  formatCurrency: (value) => `$${value}`,
}));

describe("Dashboard market-data banner", () => {
  it("shows provider-aware paper-trading disclaimer", () => {
    render(
      <Dashboard
        transactions={[]}
        showAllTransactions={false}
        toggleShowAllTransactions={() => {}}
        goToPortfolio={() => {}}
        holdings={[]}
        cash={10000}
        resetAt={null}
        investedAmount={0}
        totalValue={10000}
        strategyGrowthPct={60}
        strategyFixedPct={40}
        user={{ firstName: "Test" }}
        morningBriefing={null}
        isBriefingLoading={false}
        briefingNotice={null}
        briefingError=""
        openCashModal={() => {}}
        tradingMode="manual_user"
        onTradingModeChange={() => {}}
        recommendationDecisions={{}}
        recommendationOrderStatus={{}}
        recommendationOrderErrors={{}}
        onRecommendationDecision={() => {}}
      />,
    );
    expect(screen.getByText(/Pricing source:/i)).toBeInTheDocument();
    expect(screen.getByText(/paper trading/i)).toBeInTheDocument();
  });
});
