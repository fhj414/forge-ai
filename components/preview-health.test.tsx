/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewHealth } from "@/components/preview-health";
import type { PreviewHealthReport, PreviewHealthState } from "@/types/preview-health";

function report(
  overrides: Partial<PreviewHealthReport> = {},
): PreviewHealthReport {
  return {
    channel: "forge:preview-health",
    version: 1,
    sessionId: "preview-health-session",
    status: "healthy",
    hasMeaningfulContent: true,
    interactiveControls: 3,
    forms: 1,
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

  it("shows healthy preview facts without offering repair", () => {
    render(<PreviewHealth state={report()} />);

    expect(screen.getByText("Preview healthy")).toBeInTheDocument();
    expect(screen.getByText("Rendered content: yes")).toBeInTheDocument();
    expect(screen.getByText("Controls: 3")).toBeInTheDocument();
    expect(screen.getByText("Forms: 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask AI to fix" }),
    ).not.toBeInTheDocument();
  });

  it("shows bounded issues and requests one repair", () => {
    const onRepair = vi.fn();
    render(
      <PreviewHealth
        state={report({
          status: "issues",
          issues: [
            { message: "Cannot read properties of null" },
            { message: "Failed to load chart" },
          ],
        })}
        onRepair={onRepair}
      />,
    );

    expect(screen.getByText("2 preview issues detected")).toBeInTheDocument();
    expect(screen.getByText("Cannot read properties of null")).toBeInTheDocument();
    expect(screen.getByText("Failed to load chart")).toBeInTheDocument();
    expect(screen.getByText("Rendered content: yes")).toBeInTheDocument();
    expect(screen.getByText("Controls: 3")).toBeInTheDocument();
    expect(screen.getByText("Forms: 1")).toBeInTheDocument();

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
