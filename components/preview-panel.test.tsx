/** @vitest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "@/components/preview-panel";
import type { Project } from "@/types/project";
import type { PreviewHealthReport } from "@/types/preview-health";

const { downloadProjectHtml } = vi.hoisted(() => ({
  downloadProjectHtml: vi.fn(),
}));

vi.mock("@/lib/export-project", () => ({
  downloadProjectHtml,
}));

const project: Project = {
  id: "expense-project",
  title: "Personal Expense Tracker",
  description: "Track expenses by category.",
  html: '<form><button type="submit">Add expense</button></form>',
  css: "",
  javascript: "",
  messages: [],
  suggestions: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  revisionSource: "initial",
  revisionCreatedAt: 1_700_000_000_001,
  revisions: [],
};

describe("PreviewPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows form events while keeping generated code in an opaque origin", () => {
    render(<PreviewPanel project={project} />);

    expect(screen.getByTitle("Generated app preview")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-forms",
    );
  });

  it("offers Download HTML for an active project", () => {
    render(<PreviewPanel project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "Download HTML" }));

    expect(downloadProjectHtml).toHaveBeenCalledWith(project);
  });

  it("does not offer Download HTML without an active project", () => {
    render(<PreviewPanel project={null} />);

    expect(screen.queryByRole("button", { name: "Download HTML" })).not.toBeInTheDocument();
  });

  it("shows a report received from the current preview and session", () => {
    render(<PreviewPanel project={project} />);
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;

    dispatchHealthMessage(frame, reportFor(frame, { status: "healthy" }));

    expect(screen.getByText("Preview healthy")).toBeInTheDocument();
  });

  it("ignores a report from a different window", () => {
    render(<PreviewPanel project={project} />);
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;

    dispatchHealthMessage(frame, reportFor(frame, { status: "healthy" }), window);

    expect(screen.getByText("Checking preview…")).toBeInTheDocument();
  });

  it("ignores a report with a different session", () => {
    render(<PreviewPanel project={project} />);
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;

    dispatchHealthMessage(frame, {
      ...reportFor(frame, { status: "healthy" }),
      sessionId: "stale-preview-session",
    });

    expect(screen.getByText("Checking preview…")).toBeInTheDocument();
  });

  it("ignores malformed preview messages", () => {
    render(<PreviewPanel project={project} />);
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;

    dispatchHealthMessage(frame, { channel: "forge:preview-health" });

    expect(screen.getByText("Checking preview…")).toBeInTheDocument();
  });

  it("starts a fresh check after a project revision changes", () => {
    const { rerender } = render(<PreviewPanel project={project} />);
    const firstFrame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    const firstSession = sessionFrom(firstFrame);
    dispatchHealthMessage(firstFrame, reportFor(firstFrame, { status: "healthy" }));

    rerender(
      <PreviewPanel project={{ ...project, updatedAt: project.updatedAt + 1 }} />,
    );
    const secondFrame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;

    expect(screen.getByText("Checking preview…")).toBeInTheDocument();
    expect(sessionFrom(secondFrame)).not.toBe(firstSession);
  });

  it("marks a preview unavailable when no final report arrives in three seconds", () => {
    vi.useFakeTimers();
    render(<PreviewPanel project={project} />);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByText("Preview check unavailable")).toBeInTheDocument();
  });

  it("remounts the preview with a new session when the user retries a check", () => {
    vi.useFakeTimers();
    render(<PreviewPanel project={project} />);
    const firstFrame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    const firstSession = sessionFrom(firstFrame);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Run check again" }));

    const secondFrame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    expect(screen.getByText("Checking preview…")).toBeInTheDocument();
    expect(secondFrame).not.toBe(firstFrame);
    expect(sessionFrom(secondFrame)).not.toBe(firstSession);
  });
});

function sessionFrom(frame: HTMLIFrameElement): string {
  const session = frame.srcdoc.match(/"sessionId":"([^"]+)"/);
  if (!session?.[1]) throw new Error("Expected the preview document to contain a health session");
  return session[1];
}

function reportFor(
  frame: HTMLIFrameElement,
  overrides: Partial<PreviewHealthReport> = {},
): PreviewHealthReport {
  return {
    channel: "forge:preview-health",
    version: 1,
    sessionId: sessionFrom(frame),
    status: "healthy",
    hasMeaningfulContent: true,
    interactiveControls: 1,
    forms: 1,
    issues: [],
    reportedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function dispatchHealthMessage(
  frame: HTMLIFrameElement,
  data: unknown,
  source: MessageEventSource | null = frame.contentWindow,
) {
  const event = new MessageEvent("message", { data, source });
  act(() => {
    window.dispatchEvent(event);
  });
}
