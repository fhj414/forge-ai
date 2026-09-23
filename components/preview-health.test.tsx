/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/app/globals.css";
import { PreviewHealth } from "@/components/preview-health";
import type { PreviewHealthReport, PreviewHealthState } from "@/types/preview-health";

function report(
  overrides: Partial<PreviewHealthReport> = {},
): PreviewHealthReport {
  return {
    channel: "forge:preview-health",
    version: 2,
    sessionId: "preview-health-session",
    status: "healthy",
    hasMeaningfulContent: true,
    interactiveControls: 3,
    forms: 1,
    advertisedActions: 2,
    wiredActions: 2,
    advertisedForms: 1,
    wiredForms: 1,
    delegatedActionListeners: 0,
    interactionCoverage: "complete",
    issues: [],
    reportedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("PreviewHealth", () => {
  it("announces that a preview is being checked", () => {
    const state: PreviewHealthState = {
      ...report({ status: "checking" }),
      status: "checking",
    };

    render(<PreviewHealth state={state} />);

    expect(screen.getByLabelText("Preview health")).toHaveTextContent(
      "Checking preview…",
    );
  });

  it("reports a passed runtime check separately from complete interaction wiring", () => {
    render(<PreviewHealth state={report()} />);

    expect(screen.getByText("Runtime check passed")).toBeInTheDocument();
    expect(
      screen.getByText("Interaction wiring: 3/3 detected"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendered content: yes")).toBeInTheDocument();
    expect(screen.getByText("Controls found: 3")).toBeInTheDocument();
    expect(screen.getByText("Forms found: 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask AI to fix" }),
    ).not.toBeInTheDocument();
  });

  it("labels delegated or indirect interaction wiring as needing manual verification", () => {
    render(
      <PreviewHealth
        state={report({
          advertisedActions: 2,
          wiredActions: 0,
          advertisedForms: 1,
          wiredForms: 0,
          delegatedActionListeners: 1,
          interactionCoverage: "unknown",
        })}
      />,
    );

    expect(screen.getByText("Runtime check passed")).toBeInTheDocument();
    expect(
      screen.getByText("Interaction wiring: Manual verification needed"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask AI to fix" }),
    ).not.toBeInTheDocument();
  });

  it("reports that a static preview has no app actions", () => {
    render(
      <PreviewHealth
        state={report({
          interactiveControls: 0,
          forms: 0,
          advertisedActions: 0,
          wiredActions: 0,
          advertisedForms: 0,
          wiredForms: 0,
          interactionCoverage: "none",
        })}
      />,
    );

    expect(
      screen.getByText("Interaction wiring: No app actions detected"),
    ).toBeInTheDocument();
  });

  it("keeps concretely incomplete interaction wiring eligible for repair", () => {
    const onRepair = vi.fn();
    render(
      <PreviewHealth
        state={report({
          status: "issues",
          issues: [
            { message: "Cannot read properties of null" },
            { message: "Failed to load chart" },
          ],
          advertisedActions: 2,
          wiredActions: 1,
          advertisedForms: 1,
          wiredForms: 0,
          interactionCoverage: "incomplete",
        })}
        onRepair={onRepair}
      />,
    );

    expect(screen.getByText("2 preview issues detected")).toBeInTheDocument();
    expect(screen.getByText("Cannot read properties of null")).toBeInTheDocument();
    expect(screen.getByText("Failed to load chart")).toBeInTheDocument();
    expect(
      screen.getByText("Interaction wiring: 1/3 detected"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rendered content: yes")).toBeInTheDocument();
    expect(screen.getByText("Controls found: 3")).toBeInTheDocument();
    expect(screen.getByText("Forms found: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI to fix" }));

    expect(onRepair).toHaveBeenCalledTimes(1);
  });

  it("does not render more than five issue messages", () => {
    render(
      <PreviewHealth
        state={report({
          status: "issues",
          issues: [
            { message: "Issue 1" },
            { message: "Issue 2" },
            { message: "Issue 3" },
            { message: "Issue 4" },
            { message: "Issue 5" },
            { message: "Issue 6" },
          ],
        })}
      />,
    );

    expect(screen.getByText("5 preview issues detected")).toBeInTheDocument();
    expect(screen.getByText("Issue 5")).toBeInTheDocument();
    expect(screen.queryByText("Issue 6")).not.toBeInTheDocument();
  });

  it("bounds five maximum-length diagnostics so the repair action stays reachable at 390px", () => {
    const maximumLengthDiagnostic = "x".repeat(500);
    render(
      <div style={{ width: 390 }}>
        <PreviewHealth
          state={report({
            status: "issues",
            issues: Array.from({ length: 5 }, (_, index) => ({
              message: `${index + 1}: ${maximumLengthDiagnostic}`,
            })),
          })}
          onRepair={vi.fn()}
        />
      </div>,
    );

    const repair = screen.getByRole("button", { name: "Ask AI to fix" });
    const issues = screen.getByRole("list", { name: "Preview issues" });

    expect(issues).toHaveStyle({
      maxBlockSize: "min(5rem, 16dvh)",
      overflowY: "auto",
    });
    expect(repair.compareDocumentPosition(issues)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("offers a single retry when the check is unavailable", () => {
    const onRetry = vi.fn();
    render(
      <PreviewHealth
        state={{ status: "unavailable", sessionId: "preview-health-session" }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Preview check unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run check again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables repair while repair is unavailable", () => {
    render(
      <PreviewHealth
        state={report({
          status: "issues",
          issues: [{ message: "Cannot read properties of null" }],
        })}
        repairDisabled
      />,
    );

    expect(screen.getByRole("button", { name: "Ask AI to fix" })).toBeDisabled();
  });
});
