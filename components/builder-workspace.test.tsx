/** @vitest-environment jsdom */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuilderWorkspace } from "@/components/builder-workspace";
import type { GeneratedBuild } from "@/types/ai";
import type { PreviewHealthReport } from "@/types/preview-health";
import type { Project } from "@/types/project";

function generated(overrides: Partial<GeneratedBuild> = {}): GeneratedBuild {
  return {
    title: "Expense Atlas",
    summary: "A personal finance dashboard with clear spending insights.",
    html: '<main><button id="add">Add transaction</button></main>',
    css: "body { background: white; } @media (max-width: 600px) {}",
    javascript: "document.querySelector('#add')?.addEventListener('click', () => {});",
    changes: ["Balance cards", "Recent transactions"],
    suggestions: ["Add CSV export", "Add budget alerts"],
    generationMetadata: {
      model: "forge-test",
      durationMs: 842,
      kind: "initial",
      codeLines: 3,
      codeBytes: 154,
      schemaValidated: true,
    },
    ...overrides,
  };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const restoredProject: Project = {
  id: "saved-project",
  title: "Saved Tasks",
  description: "A focused task manager.",
  html: "<main><h1>Saved tasks</h1></main>",
  css: "body { color: navy; }",
  javascript: "",
  messages: [
    {
      id: "saved-user",
      role: "user",
      content: "Build a task manager",
      createdAt: 1_700_000_000_000,
    },
    {
      id: "saved-agent",
      role: "assistant",
      content: "A focused task manager.",
      changes: ["Task list"],
      createdAt: 1_700_000_001_000,
    },
  ],
  suggestions: ["Add keyboard shortcuts"],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  revisionSource: "refinement",
  revisionCreatedAt: 1_700_000_001_000,
  revisions: [
    {
      id: "initial-version",
      source: "initial",
      createdAt: 1_700_000_000_000,
      title: "Initial Tasks",
      description: "The original task manager.",
      html: "<main><h1>Initial tasks</h1></main>",
      css: "body { color: black; }",
      javascript: "",
      suggestions: ["Add priorities"],
    },
  ],
};

describe("BuilderWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fills the composer from an example prompt", async () => {
    const user = userEvent.setup();
    render(<BuilderWorkspace />);

    expect(screen.getByText("Build something with AI")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /use saas dashboard example/i }),
    );

    expect(screen.getByRole("textbox", { name: /describe your app/i })).toHaveValue(
      "Create a modern SaaS analytics dashboard with revenue metrics, active users, conversion rate and recent activities.",
    );
  });

  it("generates an app and sends current source during refinement", async () => {
    const user = userEvent.setup();
    const fetcher = vi.mocked(fetch);
    fetcher
      .mockImplementationOnce(() => response(generated()))
      .mockImplementationOnce(() =>
        response(
          generated({
            summary: "A dark finance dashboard with a monthly spending chart.",
            html: '<main data-theme="dark"><canvas id="monthly"></canvas></main>',
            changes: ["Dark theme", "Monthly spending chart"],
          }),
        ),
      );
    render(<BuilderWorkspace />);

    const composer = screen.getByRole("textbox", { name: /describe your app/i });
    await user.type(composer, "Create a personal expense tracker");
    await user.click(screen.getByRole("button", { name: /^generate app$/i }));

    expect(
      await screen.findByText("A personal finance dashboard with clear spending insights."),
    ).toBeInTheDocument();
    expect(screen.getByText("Build completed")).toBeInTheDocument();
    expect(screen.getByText("forge-test")).toBeInTheDocument();
    expect(screen.getByText("842 ms · 3 lines · 154 bytes")).toBeInTheDocument();
    expect(screen.getByText("Schema validated")).toBeInTheDocument();
    expect(screen.getByText("Waiting for AI response")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add CSV export" })).toBeInTheDocument();

    await user.type(composer, "Change it to a dark theme and add a monthly chart");
    await user.click(screen.getByRole("button", { name: /^refine app$/i }));

    expect(
      await screen.findByText("A dark finance dashboard with a monthly spending chart."),
    ).toBeInTheDocument();
    const secondRequest = JSON.parse(
      String(fetcher.mock.calls[1]?.[1]?.body),
    ) as { currentCode: { html: string }; prompt: string };
    expect(secondRequest.currentCode.html).toContain("Add transaction");
    expect(secondRequest.prompt).toContain("dark theme");
    await waitFor(() => {
      const projects = JSON.parse(
        localStorage.getItem("forge-ai-projects") ?? "[]",
      ) as Project[];
      expect(projects[0]?.generationMetadata).toEqual({
        model: "forge-test",
        durationMs: 842,
        kind: "initial",
        codeLines: 3,
        codeBytes: 154,
        schemaValidated: true,
      });
    });
  });

  it("keeps the workspace stable on errors and retries the same prompt", async () => {
    const user = userEvent.setup();
    const fetcher = vi.mocked(fetch);
    fetcher
      .mockImplementationOnce(() =>
        response(
          {
            error: {
              code: "AI_NOT_CONFIGURED",
              message: "AI service is not configured.",
            },
          },
          503,
        ),
      )
      .mockImplementationOnce(() => response(generated()));
    render(<BuilderWorkspace />);

    await user.type(
      screen.getByRole("textbox", { name: /describe your app/i }),
      "Build an expense tracker",
    );
    await user.click(screen.getByRole("button", { name: /^generate app$/i }));

    expect(await screen.findByText("AI service is not configured.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry generation/i }));

    expect(await screen.findByText("Build completed")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("locks project navigation while a build request is active", async () => {
    const user = userEvent.setup();
    let finishRequest: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    render(<BuilderWorkspace />);

    await user.type(
      screen.getByRole("textbox", { name: /describe your app/i }),
      "Build a task manager",
    );
    await user.click(screen.getByRole("button", { name: /^generate app$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new project/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /open history/i })).toBeDisabled();
    });

    finishRequest?.(
      new Response(JSON.stringify(generated()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await screen.findByText("Build completed")).toBeInTheDocument();
  });

  it("warns when the generated project could not be persisted", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    vi.mocked(fetch).mockImplementationOnce(() => response(generated()));
    render(<BuilderWorkspace />);

    await user.type(
      screen.getByRole("textbox", { name: /describe your app/i }),
      "Build an expense tracker",
    );
    await user.click(screen.getByRole("button", { name: /^generate app$/i }));

    expect(
      await screen.findByText("Not saved — storage unavailable"),
    ).toBeInTheDocument();
  });

  it("starts clean while preserving a saved project in history", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    expect(await screen.findByText("A focused task manager.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByText("Build something with AI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open history/i }));
    const drawer = screen.getByRole("dialog", { name: /project history/i });
    expect(within(drawer).getByText("Saved Tasks")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /open saved tasks/i }));

    expect(await screen.findByText("A focused task manager.")).toBeInTheDocument();
  });

  it("opens version history with source labels and restores the selected version", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("button", { name: /open version history/i }));

    const drawer = screen.getByRole("dialog", { name: /version history/i });
    const currentVersion = within(drawer).getByRole("article", {
      name: /current version/i,
    });
    expect(within(currentVersion).getByText("AI refinement")).toBeInTheDocument();
    expect(within(currentVersion).getByText("Saved Tasks")).toBeInTheDocument();
    expect(
      within(currentVersion).queryByRole("button", { name: /restore/i }),
    ).not.toBeInTheDocument();
    expect(within(drawer).getByText("Initial AI")).toBeInTheDocument();
    expect(within(drawer).getByText("Initial Tasks")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /restore initial tasks/i }));

    expect(await screen.findByTitle("Generated app preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("<main><h1>Initial tasks</h1></main>"),
    );
  });

  it("switches preview widths, shows source, and deletes with confirmation", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("button", { name: /mobile preview/i }));
    expect(screen.getByTestId("preview-frame-shell")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );

    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    expect(screen.getByRole("textbox", { name: /html source/i })).toHaveValue(
      "<main><h1>Saved tasks</h1></main>",
    );
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new DOMException("Clipboard denied", "NotAllowedError"),
    );
    await user.click(screen.getByRole("button", { name: /copy code/i }));
    expect(await screen.findByText("Copy failed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open history/i }));
    const drawer = screen.getByRole("dialog", { name: /project history/i });
    await act(async () => {
      await user.click(
        within(drawer).getByRole("button", { name: /delete saved tasks/i }),
      );
    });
    await waitFor(() =>
      expect(within(drawer).queryByText("Saved Tasks")).not.toBeInTheDocument(),
    );
  });

  it("discards draft code, applies the next edit, and persists it", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    const editor = screen.getByRole("textbox", { name: /html source/i });

    fireEvent.change(editor, {
      target: { value: "<main><h1>Draft tasks</h1></main>" },
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(editor).toHaveValue("<main><h1>Saved tasks</h1></main>");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    fireEvent.change(editor, {
      target: { value: "<main><h1>Edited tasks</h1></main>" },
    });
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    expect(screen.getByRole("tab", { name: /^preview$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTitle("Generated app preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("<main><h1>Edited tasks</h1></main>"),
    );
    await waitFor(() => {
      const projects = JSON.parse(
        localStorage.getItem("forge-ai-projects") ?? "[]",
      ) as Project[];
      expect(projects[0]?.html).toBe(
        "<main><h1>Edited tasks</h1></main>",
      );
    });
  });

  it("applies a dirty source file with the control save shortcut", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    await user.click(screen.getByRole("tab", { name: /^css$/i }));
    const editor = screen.getByRole("textbox", { name: /css source/i });
    fireEvent.change(editor, { target: { value: "body { color: tomato; }" } });

    await user.type(editor, "{Control>}s{/Control}");

    expect(screen.getByRole("tab", { name: /^preview$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      const projects = JSON.parse(
        localStorage.getItem("forge-ai-projects") ?? "[]",
      ) as Project[];
      expect(projects[0]?.css).toBe("body { color: tomato; }");
    });
  });

  it("keeps unsaved code when previewing before applying", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /html source/i }), {
      target: { value: "<main><h1>Unsaved tasks</h1></main>" },
    });

    await user.click(screen.getByRole("tab", { name: /^preview$/i }));
    await user.click(screen.getByRole("tab", { name: /^code$/i }));

    expect(screen.getByRole("textbox", { name: /html source/i })).toHaveValue(
      "<main><h1>Unsaved tasks</h1></main>",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("prevents manual code edits from racing an AI refinement", async () => {
    const user = userEvent.setup();
    let finishRequest: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    const editor = screen.getByRole("textbox", { name: /html source/i });
    fireEvent.change(editor, {
      target: { value: "<main><h1>Manual draft</h1></main>" },
    });
    await user.type(
      screen.getByRole("textbox", { name: /describe your app/i }),
      "Add a completed section",
    );

    expect(
      screen.getByText("Apply or discard code changes before refining."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refine app/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /open version history/i }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /discard/i }));
    await user.click(screen.getByRole("button", { name: /refine app/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(editor).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /open version history/i }),
    ).toBeDisabled();

    finishRequest?.(
      new Response(
        JSON.stringify(
          generated({
            summary: "AI refinement complete.",
            html: "<main><h1>AI tasks</h1></main>",
          }),
        ),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    expect(await screen.findByText("AI refinement complete.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /html source/i })).toHaveValue(
      "<main><h1>AI tasks</h1></main>",
    );
  });

  it("repairs the current preview with a concise audit and records an auto-fix version", async () => {
    const user = userEvent.setup();
    let finishRequest: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    dispatchHealthMessage(frame, issueReportFor(frame));
    await user.click(screen.getByRole("button", { name: "Ask AI to fix" }));

    expect(screen.getByText("Fix 1 detected preview runtime issue")).toBeInTheDocument();
    expect(screen.queryByText(/chart\.js:44/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask AI to fix" })).toBeDisabled();
    const request = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as {
      prompt: string;
      currentCode: { html: string; css: string; javascript: string };
    };
    expect(request.prompt).toContain("Chart is not a constructor");
    expect(request.currentCode).toEqual({
      html: restoredProject.html,
      css: restoredProject.css,
      javascript: restoredProject.javascript,
    });

    finishRequest?.(
      new Response(
        JSON.stringify(
          generated({
            title: "Repaired Tasks",
            summary: "The broken chart was repaired.",
            html: "<main><h1>Repaired tasks</h1></main>",
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    expect(await screen.findByText("The broken chart was repaired.")).toBeInTheDocument();
    expect(screen.getByTitle("Generated app preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("<main><h1>Repaired tasks</h1></main>"),
    );
    await waitFor(() => {
      const projects = JSON.parse(
        localStorage.getItem("forge-ai-projects") ?? "[]",
      ) as Project[];
      expect(projects[0]?.revisionSource).toBe("auto_fix");
      expect(projects[0]?.messages.at(-2)).toMatchObject({
        role: "user",
        content: "Fix 1 detected preview runtime issue",
      });
      expect(projects[0]?.revisions[0]).toMatchObject({
        source: "refinement",
        html: restoredProject.html,
      });
    });

    await user.click(screen.getByRole("button", { name: /open version history/i }));
    const drawer = screen.getByRole("dialog", { name: /version history/i });
    const currentVersion = within(drawer).getByRole("article", {
      name: /current version/i,
    });
    expect(within(currentVersion).getByText("AI auto-fix")).toBeInTheDocument();
    expect(within(currentVersion).getByText("Repaired Tasks")).toBeInTheDocument();
    expect(
      within(currentVersion).queryByRole("button", { name: /restore/i }),
    ).not.toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", { name: /restore saved tasks/i }),
    ).toBeInTheDocument();
  });

  it("disables preview repair for dirty code", async () => {
    const user = userEvent.setup();
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    dispatchHealthMessage(frame, issueReportFor(frame));
    expect(screen.getByRole("button", { name: "Ask AI to fix" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: /^code$/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /html source/i }), {
      target: { value: "<main><h1>Dirty tasks</h1></main>" },
    });

    expect(screen.getByRole("button", { name: "Ask AI to fix" })).toBeDisabled();
  });

  it("keeps the current preview and revisions unchanged when preview repair fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() =>
      response(
        { error: { code: "PROVIDER_ERROR", message: "Repair provider failed." } },
        502,
      ),
    );
    localStorage.setItem("forge-ai-projects", JSON.stringify([restoredProject]));
    localStorage.setItem("forge-ai-current-project", restoredProject.id);
    render(<BuilderWorkspace />);

    await screen.findByText("A focused task manager.");
    const frame = screen.getByTitle("Generated app preview") as HTMLIFrameElement;
    const originalSrcDoc = frame.srcdoc;
    dispatchHealthMessage(frame, issueReportFor(frame));
    await user.click(screen.getByRole("button", { name: "Ask AI to fix" }));

    expect(await screen.findByText("Repair provider failed.")).toBeInTheDocument();
    expect(screen.getByTitle("Generated app preview")).toHaveAttribute(
      "srcdoc",
      originalSrcDoc,
    );
    const projects = JSON.parse(
      localStorage.getItem("forge-ai-projects") ?? "[]",
    ) as Project[];
    expect(projects[0]?.revisionSource).toBe(restoredProject.revisionSource);
    expect(projects[0]?.revisions).toEqual(restoredProject.revisions);
  });
});

function previewSessionFrom(frame: HTMLIFrameElement): string {
  const session = frame.srcdoc.match(/"sessionId":"([^"]+)"/);
  if (!session?.[1]) throw new Error("Expected a preview health session");
  return session[1];
}

function issueReportFor(frame: HTMLIFrameElement): PreviewHealthReport {
  return {
    channel: "forge:preview-health",
    version: 1,
    sessionId: previewSessionFrom(frame),
    status: "issues",
    hasMeaningfulContent: true,
    interactiveControls: 1,
    forms: 0,
    issues: [
      {
        message: "Chart is not a constructor",
        source: "app.js",
        line: 12,
        column: 4,
        stack: "TypeError: Chart is not a constructor at chart.js:44",
      },
    ],
    reportedAt: 1_700_000_002_000,
  };
}

function dispatchHealthMessage(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data, source: frame.contentWindow }),
    );
  });
}
