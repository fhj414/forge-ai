/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "@/components/preview-panel";
import type { Project } from "@/types/project";

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
});
