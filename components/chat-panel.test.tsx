/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/chat-panel";
import type { BuildSummary } from "@/lib/build-summary";
import type { Project } from "@/types/project";

const legacyProject: Project = {
  id: "legacy-project",
  title: "Legacy tasks",
  description: "A saved project without generation metadata.",
  html: "<main>Tasks</main>",
  css: "",
  javascript: "",
  messages: [],
  suggestions: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  revisionSource: "initial",
  revisionCreatedAt: 1_700_000_000_000,
  revisions: [],
};

const legacyBuildSummary: BuildSummary = {
  components: 1,
  interactions: 0,
  responsive: false,
  persisted: true,
};

describe("ChatPanel", () => {
  it("labels markup-derived interaction counts as found elements", () => {
    render(
      <ChatPanel
        project={legacyProject}
        pendingPrompt=""
        phase="idle"
        buildSummary={{ ...legacyBuildSummary, interactions: 3 }}
        examples={[]}
        disabled={false}
        onExample={vi.fn()}
        onRetry={vi.fn()}
        onSuggestion={vi.fn()}
      />,
    );

    expect(screen.getByText("3 interactive elements found")).toBeInTheDocument();
    expect(screen.queryByText("3 interactions added")).not.toBeInTheDocument();
  });

  it("omits metadata rows and badges for a legacy project without metadata", () => {
    render(
      <ChatPanel
        project={legacyProject}
        pendingPrompt=""
        phase="idle"
        buildSummary={legacyBuildSummary}
        examples={[]}
        disabled={false}
        onExample={vi.fn()}
        onRetry={vi.fn()}
        onSuggestion={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("AI build summary")).toBeInTheDocument();
    expect(screen.queryByText("Schema validated")).not.toBeInTheDocument();
    expect(screen.queryByText("Initial generation")).not.toBeInTheDocument();
    expect(screen.queryByText("AI refinement")).not.toBeInTheDocument();
  });
});
