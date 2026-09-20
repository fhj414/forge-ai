import { describe, expect, it } from "vitest";

import { parseGeneratedApp, parseGenerateRequest } from "@/lib/schemas";

describe("parseGeneratedApp", () => {
  it("parses a fenced response and supplies optional collections", () => {
    const raw = `\n\`\`\`json\n{
      "title": "Expense Room",
      "summary": "A calm personal finance dashboard.",
      "html": "<main>Ledger</main>",
      "css": "main { color: white; }",
      "javascript": "console.log('ready')"
    }\n\`\`\`\n`;

    expect(parseGeneratedApp(raw)).toEqual({
      title: "Expense Room",
      summary: "A calm personal finance dashboard.",
      html: "<main>Ledger</main>",
      css: "main { color: white; }",
      javascript: "console.log('ready')",
      changes: [],
      suggestions: [],
    });
  });

  it("extracts the JSON object when the model adds surrounding prose", () => {
    const raw = `Here is the result:\n{
      "title": "Focus",
      "summary": "A task app",
      "html": "<main>Tasks</main>",
      "css": "body{}",
      "javascript": "",
      "changes": ["Task filters"],
      "suggestions": ["Add keyboard shortcuts"]
    }\nDone.`;

    expect(parseGeneratedApp(raw).suggestions).toEqual([
      "Add keyboard shortcuts",
    ]);
  });

  it("rejects responses without required source fields", () => {
    expect(() =>
      parseGeneratedApp('{"title":"Broken","summary":"No source"}'),
    ).toThrow(/invalid model response/i);
  });

  it("rejects oversized model source and refinement source", () => {
    const oversized = "x".repeat(200_001);
    expect(() =>
      parseGeneratedApp(
        JSON.stringify({
          title: "Too large",
          summary: "Oversized app",
          html: oversized,
          css: "",
          javascript: "",
        }),
      ),
    ).toThrow(/invalid model response/i);

    expect(() =>
      parseGenerateRequest({
        prompt: "Refine this app",
        currentCode: { html: oversized, css: "", javascript: "" },
      }),
    ).toThrow();
  });
});
