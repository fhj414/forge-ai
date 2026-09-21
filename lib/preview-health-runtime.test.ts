import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { createPreviewHealthRuntime } from "./preview-health-runtime";

type Listener = (event: Record<string, unknown>) => void;

interface RuntimeHarnessOptions {
  bodyText?: string;
  controls?: number;
  forms?: number;
  visualElement?: boolean;
  readyState?: "complete" | "loading";
}

function runRuntime(options: RuntimeHarnessOptions = {}) {
  const messages: Record<string, unknown>[] = [];
  const documentListeners = new Map<string, Listener>();
  const windowListeners = new Map<string, Listener>();
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const visualElement = options.visualElement ? {} : null;
  const controls = Array.from({ length: options.controls ?? 0 }, () => ({}));
  const forms = Array.from({ length: options.forms ?? 0 }, () => ({}));
  const document = {
    readyState: options.readyState ?? "loading",
    body: {
      textContent: options.bodyText ?? "",
      querySelector: () => visualElement,
    },
    addEventListener: (type: string, listener: Listener) => {
      documentListeners.set(type, listener);
    },
    querySelectorAll: (selector: string) => {
      if (selector === "form") return forms;
      return controls;
    },
  };
  const context: Record<string, unknown> = {
    document,
    setTimeout: (callback: () => void, delay: number) => {
      timers.push({ callback, delay });
      return timers.length;
    },
  };
  context.window = {
    addEventListener: (type: string, listener: Listener) => {
      windowListeners.set(type, listener);
    },
    parent: {
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
    setTimeout: context.setTimeout,
  };

  runInContext(createPreviewHealthRuntime("health-1"), createContext(context));

  return { document, documentListeners, messages, timers, windowListeners };
}

function settleRuntime(harness: ReturnType<typeof runRuntime>) {
  harness.document.readyState = "complete";
  harness.documentListeners.get("DOMContentLoaded")?.({});
  const settleTimer = harness.timers.find((timer) => timer.delay === 120);
  expect(settleTimer).toBeDefined();
  settleTimer?.callback();
}

describe("createPreviewHealthRuntime", () => {
  it("reports checking before it waits for DOM readiness and a settle delay", () => {
    const harness = runRuntime({
      bodyText: "Expense tracker",
      controls: 3,
      forms: 1,
    });

    expect(harness.messages[0]).toMatchObject({
      channel: "forge:preview-health",
      version: 1,
      sessionId: "health-1",
      status: "checking",
    });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({
      status: "healthy",
      hasMeaningfulContent: true,
      interactiveControls: 3,
      forms: 1,
      issues: [],
    });
  });

  it("reports bounded, normalized runtime issues when errors reject with unprintable values", () => {
    const harness = runRuntime({ bodyText: "Dashboard", readyState: "complete" });
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => {
      harness.windowListeners.get("error")?.({
        message: { circular },
        error: circular,
        filename: circular,
        lineno: -1,
        colno: Number.POSITIVE_INFINITY,
      });
      harness.windowListeners.get("unhandledrejection")?.({ reason: "network broke" });
      harness.windowListeners.get("unhandledrejection")?.({ reason: circular });
      for (let index = 0; index < 4; index += 1) {
        harness.windowListeners.get("error")?.({ message: `error-${index}` });
      }
    }).not.toThrow();

    settleRuntime(harness);

    const report = harness.messages.at(-1)!;
    expect(report).toMatchObject({ status: "issues" });
    expect(report.issues).toHaveLength(5);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.any(String) }),
      ]),
    );
    for (const issue of report.issues as Array<Record<string, unknown>>) {
      expect(issue.message).toEqual(expect.any(String));
      expect((issue.message as string).length).toBeGreaterThan(0);
      expect((issue.message as string).length).toBeLessThanOrEqual(500);
      if (issue.source !== undefined) expect(issue.source).toEqual(expect.any(String));
      if (issue.line !== undefined) expect(issue.line).toEqual(expect.any(Number));
      if (issue.column !== undefined) expect(issue.column).toEqual(expect.any(Number));
      if (issue.stack !== undefined) expect(issue.stack).toEqual(expect.any(String));
    }
    expect(
      (report.issues as Array<Record<string, unknown>>).find(
        (issue) => issue.message === "network broke",
      ),
    ).toEqual({ message: "network broke" });
  });

  it("reports an issue when the document has neither text nor a visual element", () => {
    const harness = runRuntime({ bodyText: "   ", readyState: "complete" });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      hasMeaningfulContent: false,
      issues: [expect.objectContaining({ message: expect.stringContaining("meaningful") })],
    });
  });
});
