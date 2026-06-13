import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DecisionLedger } from "./DecisionLedger";

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("../services/decisionLedger", () => ({
  fetchDecisionLedger: vi.fn(async () => [
    {
      id: "abc123",
      created_at: "2026-03-19T12:00:00Z",
      symbol: "NVDA",
      action: "trim",
      mode: "assisted",
      rule_triggers: ["take_profit"],
      ai_summary: "Trim overweight winner.",
      approved_by_user: null,
      executed: false,
      blocked_reason: null,
    },
  ]),
}));

describe("DecisionLedger", () => {
  it("renders ledger entries with blocked reason column", async () => {
    render(<DecisionLedger />);
    await waitFor(() => {
      expect(screen.getByText("NVDA")).toBeInTheDocument();
    });
    expect(screen.getByText("Trim overweight winner.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /blocked/i })).toBeInTheDocument();
  });
});
