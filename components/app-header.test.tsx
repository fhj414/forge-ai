// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/app-header";

describe("AppHeader", () => {
  it("links directly to the public Forge AI repository", () => {
    render(
      <AppHeader
        disabled={false}
        onNewProject={vi.fn()}
        onOpenHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Open GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/fhj414/forge-ai",
    );
  });
});
