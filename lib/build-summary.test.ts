import { describe, expect, it } from "vitest";

import { analyzeBuild } from "@/lib/build-summary";

describe("analyzeBuild", () => {
  it("counts structural components and interactive controls", () => {
    const summary = analyzeBuild(
      {
        html: `
        <header><nav>Budget</nav></header>
        <main>
          <section><button>Add</button><input /></section>
          <section><form><select><option>Food</option></select></form></section>
        </main>
      `,
        css: "@media (max-width: 600px) { main { display: block; } }",
        javascript:
          "document.querySelector('button').addEventListener('click', () => {});",
      },
      true,
    );

    expect(summary).toEqual({
      components: 6,
      interactions: 4,
      responsive: true,
      persisted: true,
    });
  });

  it("returns useful minimums for a very small generated page", () => {
    expect(
      analyzeBuild(
        { html: "<div>Hello</div>", css: "", javascript: "" },
        false,
      ),
    ).toEqual({
      components: 1,
      interactions: 0,
      responsive: false,
      persisted: false,
    });
  });

  it("includes trusted generation metadata when a project has it", () => {
    expect(
      analyzeBuild(
        {
          html: "<main>Ledger</main>",
          css: "body{}",
          javascript: "",
          generationMetadata: {
            model: "forge-test",
            durationMs: 842,
            kind: "initial",
            codeLines: 2,
            codeBytes: 24,
            schemaValidated: true,
          },
        },
        true,
      ),
    ).toMatchObject({
      generationMetadata: {
        model: "forge-test",
        durationMs: 842,
        kind: "initial",
        codeLines: 2,
        codeBytes: 24,
        schemaValidated: true,
      },
    });
  });
});
