/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { composePreviewDocument } from "@/lib/preview";
import type { Project } from "@/types/project";
import { createProjectExport, downloadProjectHtml } from "@/lib/export-project";

const project: Project = {
  id: "budget-project",
  title: "Quarterly: Budget / Review?* ",
  description: "Track quarterly expenses.",
  html: '<form><canvas id="chart"></canvas><button type="submit">Save</button></form>',
  css: "button { color: tomato; }",
  javascript: "localStorage.setItem('ready', 'yes'); new Chart(document.querySelector('#chart'), { type: 'bar' });",
  messages: [],
  suggestions: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  revisionSource: "initial",
  revisionCreatedAt: 1_700_000_000_001,
  revisions: [],
};

describe("createProjectExport", () => {
  it("composes the complete standalone document from the active project source", () => {
    const result = createProjectExport(project);

    expect(result.content).toBe(composePreviewDocument(project));
    expect(result.content).toContain("<form>");
    expect(result.content).toContain("button { color: tomato; }");
    expect(result.content).toContain("localStorage.setItem('ready', 'yes');");
    expect(result.filename).toBe("Quarterly Budget  Review.html");
  });

  it("includes the browser compatibility runtime used by the preview", () => {
    const { content } = createProjectExport(project);

    expect(content).toContain("__forgeCreateMemoryStorage");
    expect(content).toContain("class __ForgeChart");
    expect(content).toContain('form-action \'none\'');
  });

  it("falls back when the title contains no usable filename characters", () => {
    const { filename } = createProjectExport({ ...project, title: " .:*?<>|/\\\t\n" });

    expect(filename).toBe("forge-app.html");
  });

  it("does not add server configuration or API secrets to the download", () => {
    const { content } = createProjectExport(project);

    expect(content).not.toMatch(/AI_API_KEY|AI_API_BASE|AI_MODEL|OPENROUTER_API_KEY/);
  });
});

describe("downloadProjectHtml", () => {
  it("revokes the Blob URL even when the browser click throws", () => {
    const createObjectURL = vi.fn(() => "blob:forge-export");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("navigation blocked");
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    expect(() => downloadProjectHtml(project)).toThrow("navigation blocked");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:forge-export");

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
