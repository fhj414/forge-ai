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

  it("does not count listener text in strings or comments as interactive wiring", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        html: "<main><button>Save</button></main>",
        javascript:
          'const note = "addEventListener("; // addEventListener( is only documentation',
      }).violationCodes,
    ).toContain("ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER");
  });

  it("rejects slash-prefixed inline event handlers", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        html: "<svg/onload=alert(1)></svg>",
      }).violationCodes,
    ).toContain("HTML_INLINE_EVENT_HANDLER");
  });

  it("rejects navigator.sendBeacon as a browser network API", async () => {
    const quality = (await import("@/lib/generated-app-quality").catch(
      () => undefined,
    )) as QualityModule | undefined;

    expect(quality).toBeDefined();
    if (!quality) return;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        javascript: 'navigator.sendBeacon("/collect", "data");',
      }).violationCodes,
    ).toContain("JAVASCRIPT_NETWORK_API");
  });

  it("rejects top-level return as invalid classic-script syntax", async () => {
    const quality = (await import("@/lib/generated-app-quality")) as QualityModule;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        javascript: "return 1;",
      }).violationCodes,
    ).toContain("JAVASCRIPT_SYNTAX_ERROR");
  });

  it.each([
    ["direct fetch", "fetch('/api');"],
    ["optional fetch", "fetch?.('/api');"],
    ["aliased fetch", "const request = fetch; request('/api');"],
    ["computed window fetch", "window['fetch']('/api');"],
    ["optional navigator sendBeacon", "navigator?.sendBeacon('/collect', 'data');"],
    ["aliased XMLHttpRequest", "const Request = XMLHttpRequest; new Request();"],
  ])("rejects %s as a browser network API reference", async (_label, javascript) => {
    const quality = (await import("@/lib/generated-app-quality")) as QualityModule;

    expect(
      quality.validateGeneratedAppQuality({ ...staticApp, javascript })
        .violationCodes,
    ).toContain("JAVASCRIPT_NETWORK_API");
  });

  it.each([
    ["direct", "document.write;"],
    ["optional", "document?.write('<p>unsafe</p>');"],
    ["computed", "document['write']('<p>unsafe</p>');"],
  ])("rejects %s document.write access", async (_label, javascript) => {
    const quality = (await import("@/lib/generated-app-quality")) as QualityModule;

    expect(
      quality.validateGeneratedAppQuality({ ...staticApp, javascript })
        .violationCodes,
    ).toContain("JAVASCRIPT_DOCUMENT_WRITE");
  });

  it("rejects comment-separated dynamic imports", async () => {
    const quality = (await import("@/lib/generated-app-quality")) as QualityModule;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        javascript: "import /* keep comments from hiding syntax */ ('./feature.js');",
      }).violationCodes,
    ).toContain("JAVASCRIPT_MODULE_IMPORT");
  });

  it("ignores forbidden API names that appear only in strings or comments", async () => {
    const quality = (await import("@/lib/generated-app-quality")) as QualityModule;

    expect(
      quality.validateGeneratedAppQuality({
        ...staticApp,
        javascript: [
          'const note = "document.write( fetch?.( import( navigator.sendBeacon(";',
          "// window['fetch']('/api')",
          "/* document?.write('ignored') */",
        ].join("\n"),
      }),
    ).toEqual({
      violationCodes: [],
      correctiveMessage: "",
    });
  });
});
