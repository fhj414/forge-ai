import { createContext, runInContext } from "node:vm";

// @ts-expect-error -- jsdom does not publish bundled TypeScript declarations.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { composePreviewDocument } from "./preview";
import { createPreviewHealthRuntime } from "./preview-health-runtime";

type Listener = (event: Record<string, unknown>) => void;

interface RuntimeHarnessOptions {
  bodyText?: string;
  bodyInnerText?: string;
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
      innerText: options.bodyInnerText ?? options.bodyText ?? "",
      querySelector: () => visualElement,
    },
    addEventListener: (type: string, listener: Listener) => {
      documentListeners.set(type, listener);
    },
    querySelectorAll: (selector: string) => {
      if (selector === "form") return forms;
      if (selector === 'button, input, select, textarea, a[href], [role="button"]') {
        return controls;
      }
      return [];
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

function runDomRuntime(
  html: string,
  registerListeners?: (window: JSDOM["window"]) => void,
) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    runScripts: "outside-only",
  });
  const messages: Record<string, unknown>[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  Object.defineProperty(dom.window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  Object.defineProperty(dom.window.document.body, "innerText", {
    configurable: true,
    get: () => dom.window.document.body.textContent ?? "",
  });
  Object.defineProperty(dom.window, "parent", {
    configurable: true,
    value: {
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
  });
  dom.window.setTimeout = ((callback: TimerHandler, delay?: number) => {
    timers.push({ callback: callback as () => void, delay: delay ?? 0 });
    return timers.length;
  }) as typeof dom.window.setTimeout;

  dom.window.eval(createPreviewHealthRuntime("health-1"));
  registerListeners?.(dom.window);
  const settleTimer = timers.find((timer) => timer.delay === 120);
  expect(settleTimer).toBeDefined();
  settleTimer?.callback();

  return { dom, messages };
}

function runComposedRuntime(html: string, javascript = "") {
  const previewDocument = composePreviewDocument(
    { html, css: "", javascript },
    { diagnosticSessionId: "health-1" },
  );
  const dom = new JSDOM(previewDocument, { runScripts: "outside-only" });
  const messages: Record<string, unknown>[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  Object.defineProperty(dom.window.document, "readyState", {
    configurable: true,
    value: "complete",
  });
  Object.defineProperty(dom.window.document.body, "innerText", {
    configurable: true,
    get: () => dom.window.document.body.textContent ?? "",
  });
  Object.defineProperty(dom.window, "parent", {
    configurable: true,
    value: {
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
  });
  dom.window.setTimeout = ((callback: TimerHandler, delay?: number) => {
    timers.push({ callback: callback as () => void, delay: delay ?? 0 });
    return timers.length;
  }) as typeof dom.window.setTimeout;

  for (const script of dom.window.document.querySelectorAll("script")) {
    dom.window.eval(script.textContent ?? "");
  }
  const settleTimer = timers.find((timer) => timer.delay === 120);
  expect(settleTimer).toBeDefined();
  settleTimer?.callback();

  return { dom, messages };
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
      version: 2,
      sessionId: "health-1",
      status: "checking",
    });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      hasMeaningfulContent: true,
      interactiveControls: 3,
      forms: 1,
      advertisedActions: 0,
      wiredActions: 0,
      advertisedForms: 1,
      wiredForms: 0,
      delegatedActionListeners: 0,
      interactionCoverage: "incomplete",
      issues: [expect.objectContaining({ message: expect.stringContaining("direct") })],
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

  it("does not count composed script source as meaningful preview content", () => {
    const composedDocument = composePreviewDocument({
      html: "",
      css: "",
      javascript: "",
    });
    const scriptSource = Array.from(
      composedDocument.matchAll(/<script>([\s\S]*?)<\/script>/g),
      (match) => match[1],
    ).join("\n");
    const harness = runRuntime({
      bodyText: scriptSource,
      bodyInnerText: "",
      readyState: "complete",
    });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      hasMeaningfulContent: false,
      issues: [expect.objectContaining({ message: expect.stringContaining("meaningful") })],
    });
  });

  it("reports an updated issue result for runtime failures after settlement", () => {
    const harness = runRuntime({ bodyText: "Dashboard", readyState: "complete" });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({ status: "healthy", issues: [] });

    harness.windowListeners.get("error")?.({ message: "late failure" });

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      issues: [expect.objectContaining({ message: "late failure" })],
    });
  });

  it("reports complete direct wiring without invoking generated listeners", () => {
    let listenerCalls = 0;
    const harness = runDomRuntime(
      '<button id="save">Save</button><div role="button" id="cancel">Cancel</div>',
      (window) => {
        window.document.querySelector("#save")?.addEventListener("click", () => {
          listenerCalls += 1;
        });
        window.document.querySelector("#cancel")?.addEventListener("keydown", () => {
          listenerCalls += 1;
        });
      },
    );

    expect(listenerCalls).toBe(0);
    expect(harness.messages.at(-1)).toMatchObject({
      version: 2,
      status: "healthy",
      advertisedActions: 2,
      wiredActions: 2,
      advertisedForms: 0,
      wiredForms: 0,
      delegatedActionListeners: 0,
      interactionCoverage: "complete",
      issues: [],
    });
  });

  it("reports incomplete coverage with a concrete issue for partial direct wiring", () => {
    const harness = runDomRuntime(
      '<button id="save">Save</button><button id="cancel">Cancel</button>',
      (window) => {
        window.document.querySelector("#save")?.addEventListener("click", () => {});
      },
    );

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      advertisedActions: 2,
      wiredActions: 1,
      delegatedActionListeners: 0,
      interactionCoverage: "incomplete",
      issues: [expect.objectContaining({ message: expect.stringContaining("direct") })],
    });
  });

  it("does not credit guarded registration against a selector that matches nothing", () => {
    const harness = runDomRuntime('<button id="save">Save</button>', (window) => {
      window.document.querySelector("#missing")?.addEventListener("click", () => {});
    });

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      advertisedActions: 1,
      wiredActions: 0,
      interactionCoverage: "incomplete",
    });
  });

  it("does not credit null handlers or case-mismatched event names as direct wiring", () => {
    const harness = runDomRuntime(
      '<button id="null-handler">Null</button><button id="wrong-case">Wrong case</button>',
      (window) => {
        window.document.querySelector("#null-handler")?.addEventListener("click", null);
        window.document.querySelector("#wrong-case")?.addEventListener("CLICK", () => {});
      },
    );

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      advertisedActions: 2,
      wiredActions: 0,
      interactionCoverage: "incomplete",
    });
  });

  it("keeps a concrete incomplete-wiring issue when earlier runtime errors fill the issue bound", () => {
    const harness = runDomRuntime('<button id="save">Save</button>', (window) => {
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(
          new window.ErrorEvent("error", { message: `early failure ${index}` }),
        );
      }
    });

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      interactionCoverage: "incomplete",
    });
    expect(harness.messages.at(-1)?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("direct") }),
      ]),
    );
    expect(harness.messages.at(-1)?.issues).toHaveLength(5);
  });

  it("treats direct form submission as form wiring while tracking non-submit buttons separately", () => {
    const harness = runDomRuntime(
      '<form id="editor"><input name="title"><button type="submit">Save</button><button type="button" id="clear">Clear</button></form>',
      (window) => {
        window.document.querySelector("#editor")?.addEventListener("submit", () => {});
        window.document.querySelector("#clear")?.addEventListener("click", () => {});
      },
    );

    expect(harness.messages.at(-1)).toMatchObject({
      status: "healthy",
      advertisedActions: 1,
      wiredActions: 1,
      advertisedForms: 1,
      wiredForms: 1,
      interactionCoverage: "complete",
    });
  });

  it("does not credit Forge's compatibility submit guard as generated form wiring", () => {
    const harness = runComposedRuntime(
      '<form><button type="submit">Save</button></form>',
    );

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      advertisedActions: 1,
      wiredActions: 0,
      advertisedForms: 1,
      wiredForms: 0,
      delegatedActionListeners: 0,
      interactionCoverage: "incomplete",
    });
  });

  it("reports unknown when delegated listeners make missing direct coverage ambiguous", () => {
    const harness = runDomRuntime('<button id="save">Save</button>', (window) => {
      window.document.addEventListener("click", () => {});
    });

    expect(harness.messages.at(-1)).toMatchObject({
      status: "healthy",
      advertisedActions: 1,
      wiredActions: 0,
      delegatedActionListeners: 1,
      interactionCoverage: "unknown",
      issues: [],
    });
  });

  it("reports none for static content and ignores native links", () => {
    const harness = runDomRuntime('<main>Documentation <a href="/docs">Read more</a></main>');

    expect(harness.messages.at(-1)).toMatchObject({
      status: "healthy",
      advertisedActions: 0,
      wiredActions: 0,
      advertisedForms: 0,
      wiredForms: 0,
      delegatedActionListeners: 0,
      interactionCoverage: "none",
    });
  });

  it("preserves interaction evidence when reporting a late runtime error", () => {
    const harness = runDomRuntime('<button id="save">Save</button>', (window) => {
      window.document.querySelector("#save")?.addEventListener("change", () => {});
    });

    harness.dom.window.dispatchEvent(
      new harness.dom.window.ErrorEvent("error", { message: "late failure" }),
    );

    expect(harness.messages.at(-1)).toMatchObject({
      status: "issues",
      advertisedActions: 1,
      wiredActions: 1,
      interactionCoverage: "complete",
      issues: [expect.objectContaining({ message: "late failure" })],
    });
  });

  it("clamps interactive and form counts to the preview health protocol maximum", () => {
    const harness = runRuntime({
      bodyText: "Dashboard",
      controls: 10_001,
      forms: 10_001,
      readyState: "complete",
    });

    settleRuntime(harness);

    expect(harness.messages.at(-1)).toMatchObject({
      interactiveControls: 10_000,
      forms: 10_000,
    });
  });
});
