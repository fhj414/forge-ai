import { describe, expect, it } from "vitest";

import type { GeneratedApp } from "@/types/ai";

type QualityModule = {
  validateGeneratedAppQuality(app: GeneratedApp): {
    violationCodes: string[];
    correctiveMessage: string;
  };
};

const staticApp: GeneratedApp = {
  title: "Reading Room",
  summary: "A quiet static reading list.",
  html: "<main><h1>Reading room</h1><p>Three books to explore.</p></main>",
  css: "main { color: #111; }",
  javascript: "",
  changes: [],
  suggestions: [],
};

describe("validateGeneratedAppQuality", () => {
  it("rejects unsafe or inert interactive artifacts with bounded corrective guidance", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    const result = quality.validateGeneratedAppQuality({
      ...staticApp,
      html: '<html><body><button onclick="save()">Save</button><script>bad()</script></body></html>',
      javascript: "import helper from 'helper'; fetch('/api'); document.write('x');",
    });

    expect(result.violationCodes).toEqual([
      "HTML_DOCUMENT_WRAPPER",
      "HTML_SCRIPT_WRAPPER",
      "HTML_INLINE_EVENT_HANDLER",
      "ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER",
      "JAVASCRIPT_SYNTAX_ERROR",
      "JAVASCRIPT_NETWORK_API",
      "JAVASCRIPT_MODULE_IMPORT",
      "JAVASCRIPT_DOCUMENT_WRITE",
    ]);
    expect(result.correctiveMessage).toContain("HTML_DOCUMENT_WRAPPER");
    expect(result.correctiveMessage.length).toBeLessThanOrEqual(500);
  });

  it("accepts static, non-interactive content without JavaScript", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    expect(quality.validateGeneratedAppQuality(staticApp)).toEqual({
      violationCodes: [],
      correctiveMessage: "",
    });
  });

  it("does not treat hidden inputs as actionable content", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        html: '<section><input type="hidden" name="token"><input hidden name="draft"></section>',
      }),
    ).toEqual({
      violationCodes: [],
      correctiveMessage: "",
    });
  });
});
