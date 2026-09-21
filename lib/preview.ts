import type { AppCode } from "@/types/ai";

import { createPreviewHealthRuntime } from "./preview-health-runtime";

export interface PreviewDocumentOptions {
  diagnosticSessionId?: string;
}

function neutralizeClosingTag(source: string, tag: "script" | "style") {
  return source.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

export function composePreviewDocument(
  code: AppCode,
  options?: PreviewDocumentOptions,
): string {
  const safeCss = neutralizeClosingTag(code.css, "style");
  const safeJavaScript = neutralizeClosingTag(code.javascript, "script");
  const healthRuntime = options?.diagnosticSessionId
    ? `<script>\n      ${createPreviewHealthRuntime(options.diagnosticSessionId)}\n    </script>`
    : "";

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
    <script>
      (() => {
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

      class __ForgeChart {
        constructor(target, config = {}) {
          this.ctx = target?.canvas ? target : target?.getContext?.("2d");
          this.canvas = this.ctx?.canvas;
          this.config = config;
          this.type = config?.type || "bar";
          this.data = config?.data || { labels: [], datasets: [] };
          this.options = config?.options || {};
          this.render();
        }

        render() {
          const ctx = this.ctx;
          const canvas = this.canvas;
          if (!ctx || !canvas) return;

          const width = Number(canvas.width) || 300;
          const height = Number(canvas.height) || 150;
          const padding = Math.max(20, Math.min(width, height) * 0.12);
          const datasets = Array.isArray(this.data?.datasets)
            ? this.data.datasets
            : [];
          const labels = Array.isArray(this.data?.labels)
            ? this.data.labels
            : [];
          const palette = [
            "#6366f1", "#22c55e", "#f97316", "#06b6d4",
            "#ec4899", "#eab308", "#8b5cf6", "#14b8a6",
          ];
          const colorAt = (value, index) => {
            if (Array.isArray(value) && value.length > 0) {
              return value[index % value.length];
            }
            return typeof value === "string" ? value : palette[index % palette.length];
          };
          const valuesFor = (dataset) =>
            Array.isArray(dataset?.data)
              ? dataset.data.map((value) => Number(value) || 0)
              : [];
          const type = this.type || datasets[0]?.type || "bar";

          ctx.clearRect(0, 0, width, height);

          if (type === "pie" || type === "doughnut") {
            const dataset = datasets[0] || {};
            const values = valuesFor(dataset).map((value) => Math.max(0, value));
            const total = values.reduce((sum, value) => sum + value, 0) || 1;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.max(1, Math.min(width, height) / 2 - padding);
            let angle = -Math.PI / 2;

            values.forEach((value, index) => {
              const nextAngle = angle + (value / total) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(centerX, centerY);
              ctx.arc(centerX, centerY, radius, angle, nextAngle);
              ctx.closePath();
              ctx.fillStyle = colorAt(dataset.backgroundColor, index);
              ctx.fill();
              angle = nextAngle;
            });

            if (type === "doughnut" && typeof ctx.save === "function") {
              ctx.save();
              ctx.globalCompositeOperation = "destination-out";
              ctx.beginPath();
              ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            return;
          }

          const allValues = datasets.flatMap(valuesFor);
          const maximum = Math.max(1, ...allValues);
          const minimum = Math.min(0, ...allValues);
          const range = maximum - minimum || 1;
          const plotWidth = Math.max(1, width - padding * 2);
          const plotHeight = Math.max(1, height - padding * 2);
          const pointCount = Math.max(
            1,
            labels.length,
            ...datasets.map((dataset) => valuesFor(dataset).length),
          );
          const yFor = (value) => padding + ((maximum - value) / range) * plotHeight;

          if (type === "line") {
            datasets.forEach((dataset, datasetIndex) => {
              const values = valuesFor(dataset);
              if (values.length === 0) return;
              ctx.beginPath();
              values.forEach((value, index) => {
                const x = padding + (index / Math.max(1, pointCount - 1)) * plotWidth;
                const y = yFor(value);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.strokeStyle = colorAt(dataset.borderColor, datasetIndex);
              ctx.lineWidth = Number(dataset.borderWidth) || 2;
              ctx.stroke();
            });
            return;
          }

          const datasetCount = Math.max(1, datasets.length);
          const groupWidth = plotWidth / pointCount;
          const barWidth = Math.max(1, (groupWidth * 0.72) / datasetCount);
          const zeroY = yFor(0);

          datasets.forEach((dataset, datasetIndex) => {
            valuesFor(dataset).forEach((value, index) => {
              const x = padding + index * groupWidth + groupWidth * 0.14 + datasetIndex * barWidth;
              const valueY = yFor(value);
              ctx.fillStyle = colorAt(dataset.backgroundColor, index);
              ctx.fillRect(x, Math.min(valueY, zeroY), barWidth, Math.max(1, Math.abs(zeroY - valueY)));
            });
          });
        }

        update() {
          this.render();
        }

        resize() {
          this.render();
        }

        destroy() {
          if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
        }

        static register() {}
      }
      __ForgeChart.defaults = {};

      const __forgeChartConstructor =
        typeof window.Chart === "function" ? window.Chart : __ForgeChart;
      try {
        window.Chart = __forgeChartConstructor;
      } catch (error) {
        console.warn("Forge preview chart compatibility is limited", error);
      }

      document.addEventListener("submit", (event) => {
        event.preventDefault();
      }, true);
      })();
    </script>
    ${healthRuntime}
    ${code.html}
    <script>
      ${safeJavaScript}
    </script>
  </body>
</html>`;
}
