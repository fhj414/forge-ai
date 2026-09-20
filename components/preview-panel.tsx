"use client";

import { Code2, Eye, Monitor, Smartphone, Tablet } from "lucide-react";
import { useMemo, useState } from "react";

import { CodeViewer } from "@/components/code-viewer";
import { composePreviewDocument } from "@/lib/preview";
import type { Project } from "@/types/project";

type PanelMode = "preview" | "code";
type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Array<{
  id: Viewport;
  label: string;
  Icon: typeof Monitor;
}> = [
  { id: "desktop", label: "Desktop", Icon: Monitor },
  { id: "tablet", label: "Tablet", Icon: Tablet },
  { id: "mobile", label: "Mobile", Icon: Smartphone },
];

export function PreviewPanel({ project }: { project: Project | null }) {
  const [mode, setMode] = useState<PanelMode>("preview");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const srcDoc = useMemo(
    () => (project ? composePreviewDocument(project) : ""),
    [project],
  );

  return (
    <section className="preview-panel" aria-label="Generated application">
      <div className="preview-toolbar">
        <div className="panel-tabs" role="tablist" aria-label="Result view">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "code"}
            onClick={() => setMode("code")}
          >
            <Code2 size={14} /> Code
          </button>
        </div>

        {mode === "preview" ? (
          <div className="viewport-controls" aria-label="Preview viewport">
            {VIEWPORTS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                data-active={viewport === id}
                aria-label={`${label} preview`}
                onClick={() => setViewport(id)}
              >
                <Icon size={14} />
              </button>
            ))}
            <span className="viewport-size">
              {viewport === "desktop"
                ? "100%"
                : viewport === "tablet"
                  ? "768px"
                  : "390px"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="preview-body">
        {!project ? (
          <div className="preview-empty">
            <span className="empty-window">
              <span />
              <span />
              <span />
            </span>
            <div className="empty-glyph">
              <SparkGlyph />
            </div>
            <strong>Your app will appear here</strong>
            <p>Start with a prompt. Forge will generate, validate, and render it live.</p>
          </div>
        ) : mode === "preview" ? (
          <div className="preview-canvas">
            <div
              className="preview-frame-shell"
              data-viewport={viewport}
              data-testid="preview-frame-shell"
            >
              <iframe
                key={project.updatedAt}
                title="Generated app preview"
                sandbox="allow-scripts"
                srcDoc={srcDoc}
              />
            </div>
          </div>
        ) : (
          <CodeViewer code={project} />
        )}
      </div>
    </section>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4c1.2 11.7 8.3 18.8 20 20-11.7 1.2-18.8 8.3-20 20-1.2-11.7-8.3-18.8-20-20C15.7 22.8 22.8 15.7 24 4Z" />
      <path d="M39 4c.4 3.1 1.9 4.6 5 5-3.1.4-4.6 1.9-5 5-.4-3.1-1.9-4.6-5-5 3.1-.4 4.6-1.9 5-5Z" />
    </svg>
  );
}
