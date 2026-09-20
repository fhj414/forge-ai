import type { AppCode } from "@/types/ai";

function neutralizeClosingTag(source: string, tag: "script" | "style") {
  return source.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

export function composePreviewDocument(code: AppCode): string {
  const safeCss = neutralizeClosingTag(code.css, "style");
  const safeJavaScript = neutralizeClosingTag(code.javascript, "script");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none';" />
    <style>
      html, body { min-height: 100%; }
      body { margin: 0; }
      *, *::before, *::after { box-sizing: border-box; }
      ${safeCss}
    </style>
  </head>
  <body>
    ${code.html}
    <script>
      try {
        ${safeJavaScript}
      } catch (error) {
        console.error("Forge preview error", error);
      }
    </script>
  </body>
</html>`;
}
