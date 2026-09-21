/** @vitest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useProjects } from "@/hooks/use-projects";
import type { GeneratedBuild } from "@/types/ai";
import type { Project } from "@/types/project";

function build(overrides: Partial<GeneratedBuild> = {}): GeneratedBuild {
  return {
    title: "Initial build",
    summary: "The first generated artifact.",
    html: "<main>Initial</main>",
    css: "body { color: navy; }",
    javascript: "console.log('initial');",
    changes: ["Initial layout"],
    suggestions: ["Add filters"],
    generationMetadata: {
      model: "forge-test",
      durationMs: 125,
      kind: "initial",
      codeLines: 3,
      codeBytes: 68,
      schemaValidated: true,
    },
    ...overrides,
  };
}

function ProjectHarness() {
  const projects = useProjects();
  const current = projects.currentProject;

  return (
    <>
      <button type="button" onClick={() => projects.commitGeneration(build(), "Create it")}>
        Create
      </button>
      <button
        type="button"
        onClick={() =>
          projects.commitGeneration(
            build({
              title: "Refined build",
              summary: "The refined artifact.",
              html: "<main>Refined</main>",
              css: "body { color: tomato; }",
              javascript: "console.log('refined');",
              suggestions: ["Add exports"],
              generationMetadata: {
                model: "forge-test",
                durationMs: 250,
                kind: "refinement",
                codeLines: 3,
                codeBytes: 72,
                schemaValidated: true,
              },
            }),
            "Refine it",
          )
        }
      >
        Refine
      </button>
      <button
        type="button"
        onClick={() =>
          projects.commitGeneration(
            build({
              title: "Repaired build",
              summary: "The preview issue was repaired.",
              html: "<main>Repaired</main>",
              css: "body { color: green; }",
              javascript: "console.log('repaired');",
              suggestions: ["Verify the chart"],
            }),
            "Fix detected preview issue",
            "auto_fix",
          )
        }
      >
        Auto-fix
      </button>
      <button
        type="button"
        onClick={() =>
          projects.updateCurrentProject({
            html: "<main>Manual</main>",
            css: "body { color: olive; }",
            javascript: "console.log('manual');",
          })
        }
      >
        Apply
      </button>
      <button
        type="button"
        onClick={() => {
          for (let index = 1; index <= 11; index += 1) {
            projects.updateCurrentProject({
              html: `<main>Manual ${index}</main>`,
              css: `body { --step: ${index}; }`,
              javascript: `console.log(${index});`,
            });
          }
        }}
      >
        Apply eleven
      </button>
      <button
        type="button"
        onClick={() => {
          const versionId = current?.revisions?.[0]?.id;
          if (versionId) projects.restoreProjectVersion(versionId);
        }}
      >
        Restore first
      </button>
      <output aria-label="Project state">{JSON.stringify(current)}</output>
    </>
  );
}

function currentProject(): Project {
  const content = screen.getByRole("status", { name: "Project state" }).textContent;
  if (!content) throw new Error("Expected a current project");
  return JSON.parse(content) as Project;
}

async function waitForHydration() {
  await act(async () => {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  });
}

describe("useProjects revision history", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("snapshots the full artifact before AI refinement and manual Apply", async () => {
    render(<ProjectHarness />);
    await waitForHydration();

    await act(async () => {
      screen.getByRole("button", { name: "Create" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Refine" }).click();
    });

    await waitFor(() => expect(currentProject().html).toBe("<main>Refined</main>"));
    expect(currentProject().revisions?.[0]).toMatchObject({
      source: "initial",
      title: "Initial build",
      description: "The first generated artifact.",
      html: "<main>Initial</main>",
      css: "body { color: navy; }",
      javascript: "console.log('initial');",
      suggestions: ["Add filters"],
      generationMetadata: build().generationMetadata,
    });

    await act(async () => {
      screen.getByRole("button", { name: "Apply" }).click();
    });

    await waitFor(() => expect(currentProject().html).toBe("<main>Manual</main>"));
    expect(currentProject().revisionSource).toBe("manual");
    expect(currentProject().revisions?.[0]).toMatchObject({
      source: "refinement",
      title: "Refined build",
      html: "<main>Refined</main>",
      generationMetadata: {
        kind: "refinement",
      },
    });
  });

  it("keeps the ten newest prior revisions", async () => {
    render(<ProjectHarness />);
    await waitForHydration();

    await act(async () => {
      screen.getByRole("button", { name: "Create" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Apply eleven" }).click();
    });

    await waitFor(() => expect(currentProject().html).toBe("<main>Manual 11</main>"));
    expect(currentProject().revisions ?? []).toHaveLength(10);
    expect((currentProject().revisions ?? []).map((revision) => revision.html)).toEqual([
      "<main>Manual 10</main>",
      "<main>Manual 9</main>",
      "<main>Manual 8</main>",
      "<main>Manual 7</main>",
      "<main>Manual 6</main>",
      "<main>Manual 5</main>",
      "<main>Manual 4</main>",
      "<main>Manual 3</main>",
      "<main>Manual 2</main>",
      "<main>Manual 1</main>",
    ]);
  });

  it("commits an auto-fix with a concise audit message and the replaced artifact first", async () => {
    render(<ProjectHarness />);
    await waitForHydration();

    await act(async () => {
      screen.getByRole("button", { name: "Create" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Apply eleven" }).click();
    });
    await waitFor(() => expect(currentProject().html).toBe("<main>Manual 11</main>"));
    await act(async () => {
      screen.getByRole("button", { name: "Auto-fix" }).click();
    });

    await waitFor(() => expect(currentProject().html).toBe("<main>Repaired</main>"));
    expect(currentProject()).toMatchObject({
      revisionSource: "auto_fix",
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Fix detected preview issue",
        }),
      ]),
    });
    expect(currentProject().revisions).toHaveLength(10);
    expect(currentProject().revisions?.[0]).toMatchObject({
      source: "manual",
      title: "Initial build",
      html: "<main>Manual 11</main>",
    });
  });

  it("restores a snapshot while retaining the replaced current state", async () => {
    render(<ProjectHarness />);
    await waitForHydration();

    await act(async () => {
      screen.getByRole("button", { name: "Create" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Refine" }).click();
    });
    await waitFor(() => expect(currentProject().revisions ?? []).toHaveLength(1));

    await act(async () => {
      screen.getByRole("button", { name: "Restore first" }).click();
    });

    await waitFor(() => expect(currentProject().html).toBe("<main>Initial</main>"));
    expect(currentProject()).toMatchObject({
      revisionSource: "restore",
      messages: expect.arrayContaining([
        expect.objectContaining({ content: "Create it" }),
        expect.objectContaining({ content: "Refine it" }),
      ]),
    });
    expect(currentProject().revisions ?? []).toHaveLength(1);
    expect(currentProject().revisions?.[0]).toMatchObject({
      source: "refinement",
      html: "<main>Refined</main>",
    });
  });
});
