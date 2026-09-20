/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreviewPanel } from "@/components/preview-panel";
import type { Project } from "@/types/project";

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
};

describe("PreviewPanel", () => {
  it("allows form events while keeping generated code in an opaque origin", () => {
    render(<PreviewPanel project={project} />);

    expect(screen.getByTitle("Generated app preview")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-forms",
    );
  });
});
