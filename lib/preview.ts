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
      const __forgeCreateMemoryStorage = () => {
        const values = new Map();

        return {
          get length() {
            return values.size;
          },
          clear() {
            values.clear();
          },
          getItem(key) {
            const normalizedKey = String(key);
            return values.has(normalizedKey) ? values.get(normalizedKey) : null;
          },
          key(index) {
            return Array.from(values.keys())[Number(index)] ?? null;
          },
          removeItem(key) {
            values.delete(String(key));
          },
          setItem(key, value) {
            values.set(String(key), String(value));
          },
        };
      };
      const __forgeLocalStorage = __forgeCreateMemoryStorage();
      const __forgeSessionStorage = __forgeCreateMemoryStorage();

      try {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          value: __forgeLocalStorage,
        });
        Object.defineProperty(window, "sessionStorage", {
          configurable: true,
          value: __forgeSessionStorage,
        });
      } catch (error) {
        console.warn("Forge preview storage compatibility is limited", error);
      }

      const localStorage = __forgeLocalStorage;
      const sessionStorage = __forgeSessionStorage;

      try {
        ${safeJavaScript}
      } catch (error) {
        console.error("Forge preview error", error);
      }
    </script>
  </body>
</html>`;
}
