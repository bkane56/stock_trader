import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { InstantMagicCodeLogin } from "../components/InstantMagicCodeLogin";
import { TradingModeSelector } from "../components/TradingModeSelector";
import { CashAdjustmentModal } from "../components/CashAdjustmentModal";
import { ResetPortfolioModal } from "../components/ResetPortfolioModal";
import { MobileNav } from "../components/MobileNav";
import { LayoutDashboard, Briefcase } from "lucide-react";
import { Portfolio } from "../containers/Portfolio";
import { StrategyBuilder } from "../containers/StrategyBuilder";

describe("accessibility", () => {
  it("InstantMagicCodeLogin has no axe violations", async () => {
    const db = { auth: { sendMagicCode: vi.fn(), signInWithMagicCode: vi.fn() } };
    const { container } = render(<InstantMagicCodeLogin db={db} authError={null} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TradingModeSelector has no axe violations", async () => {
    const { container } = render(
      <TradingModeSelector value="manual" onChange={() => {}} showDescriptions />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("CashAdjustmentModal has no axe violations", async () => {
    const { container } = render(
      <CashAdjustmentModal
        isOpen
        mode="deposit"
        cash={10000}
        onClose={() => {}}
        onAdjustCashReserve={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ResetPortfolioModal has no axe violations", async () => {
    const { container } = render(
      <ResetPortfolioModal isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MobileNav has no axe violations", async () => {
    const items = [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/portfolio", label: "Portfolio", icon: Briefcase },
    ];
    const { container } = render(
      <MemoryRouter>
        <MobileNav items={items} />
      </MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Portfolio has no axe violations", async () => {
    const holdings = [
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        sector: "Technology",
        shares: 10,
        price: 180,
        totalValue: 1800,
        analysis: { tag: "hold", text: "Stable large-cap exposure." },
      },
    ];
    const { container } = render(
      <Portfolio
        holdings={holdings}
        cash={5000}
        totalValue={6800}
        openTradeModal={() => {}}
        openAddPurchaseModal={() => {}}
        openCashModal={() => {}}
        morningBriefing={null}
        tradingMode="manual"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("StrategyBuilder has no axe violations", async () => {
    const { container } = render(
      <div style={{ width: 800, height: 900 }}>
        <StrategyBuilder strategySplit={60} onApplyStrategy={async () => true} />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
