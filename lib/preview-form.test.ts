/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { composePreviewDocument } from "@/lib/preview";

describe("preview form compatibility", () => {
  it("prevents form navigation without blocking generated submit handlers", () => {
    const previewDocument = composePreviewDocument({
      html: `
        <form id="expense-form">
          <button type="submit">Add expense</button>
        </form>
        <output id="status">idle</output>
      `,
      css: "",
      javascript: `
        document.querySelector("#expense-form").addEventListener("submit", () => {
          document.querySelector("#status").textContent = "expense-added";
        });
      `,
    });
    const parsedDocument = new DOMParser().parseFromString(
      previewDocument,
      "text/html",
    );
    const scripts = Array.from(
      parsedDocument.querySelectorAll("script"),
      (script) => script.textContent ?? "",
    );
    const errors: unknown[][] = [];
    const previewWindow: Record<string, unknown> = {};

    for (const script of scripts) {
      const runPreviewScript = new Function(
        "window",
        "document",
        "console",
        script,
      );
      runPreviewScript(previewWindow, parsedDocument, {
        error: (...args: unknown[]) => errors.push(args),
        warn: (...args: unknown[]) => errors.push(args),
      });
    }

    const form = parsedDocument.querySelector("#expense-form");
    const event = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    });

    expect(form).not.toBeNull();

    const shouldSubmit = form!.dispatchEvent(event);

    expect(shouldSubmit).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(parsedDocument.querySelector("#status")?.textContent).toBe(
      "expense-added",
    );
    expect(errors).toEqual([]);
  });
});
