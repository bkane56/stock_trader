import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DecisionLedger } from "./DecisionLedger";

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));

const mockEntry = {
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
};

const fetchDecisionLedger = vi.fn();
const clearDecisionLedger = vi.fn();

vi.mock("../services/decisionLedger", () => ({
  fetchDecisionLedger: (...args) => fetchDecisionLedger(...args),
  clearDecisionLedger: (...args) => clearDecisionLedger(...args),
}));

describe("DecisionLedger", () => {
  beforeEach(() => {
    fetchDecisionLedger.mockReset();
    clearDecisionLedger.mockReset();
    fetchDecisionLedger.mockResolvedValue([mockEntry]);
    clearDecisionLedger.mockResolvedValue({ deleted: 1 });
  });

  it("renders ledger entries with blocked reason column", async () => {
    render(<DecisionLedger />);
    await waitFor(() => {
      expect(screen.getByText("NVDA")).toBeInTheDocument();
    });
    expect(screen.getByText("Trim overweight winner.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /blocked/i })).toBeInTheDocument();
  });

  it("clears the ledger after confirmation", async () => {
    render(<DecisionLedger />);

    await waitFor(() => {
      expect(screen.getByText("NVDA")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear decision ledger/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, clear ledger/i }));

    await waitFor(() => {
      expect(clearDecisionLedger).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByText(/no decision entries yet/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
  });
});
