"use client";

import {
  Code2,
  Download,
  Eye,
  History,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CodeViewer } from "@/components/code-viewer";
import { PreviewHealth } from "@/components/preview-health";
import { downloadProjectHtml } from "@/lib/export-project";
import { parsePreviewHealthMessage } from "@/lib/preview-health";
import { composePreviewDocument } from "@/lib/preview";
import { createId } from "@/lib/utils";
import type { AppCode } from "@/types/ai";
import type { PreviewHealthReport, PreviewHealthState } from "@/types/preview-health";
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

export function PreviewPanel({
  project,
  disabled = false,
  versionHistoryDisabled = false,
  onApplyCode = () => {},
  onOpenVersionHistory,
  onDirtyChange,
  onRepair,
  repairDisabled = false,
}: {
  project: Project | null;
  disabled?: boolean;
  versionHistoryDisabled?: boolean;
  onApplyCode?: (code: AppCode) => void;
  onOpenVersionHistory?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRepair?: (report: PreviewHealthReport) => void;
  repairDisabled?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>("preview");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasProject = Boolean(project);
  const sessionKey = `${project?.id ?? "none"}:${project?.updatedAt ?? "none"}:${retryCount}`;
  const diagnosticSession = useMemo(
    () => ({ id: createId("preview-health"), key: sessionKey }),
    [sessionKey],
  );
  const sessionId = diagnosticSession.id;
  const [healthState, setHealthState] = useState<PreviewHealthState>(() =>
    checkingState(sessionId),
  );
  const srcDoc = useMemo(
    () =>
      project
        ? composePreviewDocument(project, { diagnosticSessionId: sessionId })
        : "",
    [project, sessionId],
  );
  const displayedHealthState =
    healthState.sessionId === sessionId ? healthState : checkingState(sessionId);

  useEffect(() => {
    function receivePreviewHealth(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const report = parsePreviewHealthMessage(event.data, sessionId);
      if (report) setHealthState(report);
    }

    window.addEventListener("message", receivePreviewHealth);
    return () => window.removeEventListener("message", receivePreviewHealth);
  }, [sessionId]);

  useEffect(() => {
    if (!hasProject) return;

    const timeout = window.setTimeout(() => {
      setHealthState((current) =>
        current.sessionId !== sessionId || current.status === "checking"
          ? { status: "unavailable", sessionId }
          : current,
      );
    }, 3_000);

    return () => window.clearTimeout(timeout);
  }, [hasProject, sessionId]);

  function applyCode(code: AppCode) {
    onApplyCode(code);
    setMode("preview");
  }

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
        {project ? (
          <div className="preview-actions">
            <button
              className="preview-export-button"
              type="button"
              onClick={() => downloadProjectHtml(project)}
              aria-label="Download HTML"
            >
              <Download size={14} /> Download HTML
            </button>
            {onOpenVersionHistory ? (
              <button
                className="version-history-button"
                type="button"
                disabled={versionHistoryDisabled}
                onClick={onOpenVersionHistory}
                aria-label="Open version history"
              >
                <History size={14} /> Versions
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {project ? (
        <PreviewHealth
          state={displayedHealthState}
          onRepair={onRepair}
          onRetry={() => setRetryCount((count) => count + 1)}
          repairDisabled={repairDisabled}
        />
      ) : null}

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
        ) : (
          <>
            <div className="preview-canvas" hidden={mode !== "preview"}>
              <div
                className="preview-frame-shell"
                data-viewport={viewport}
                data-testid="preview-frame-shell"
              >
                <iframe
                  ref={iframeRef}
                  key={sessionId}
                  title="Generated app preview"
                  sandbox="allow-scripts allow-forms"
                  srcDoc={srcDoc}
                />
              </div>
            </div>
            <div className="code-panel-shell" hidden={mode !== "code"}>
              <CodeViewer
                key={`${project.id}-${project.updatedAt}`}
                code={project}
                disabled={disabled}
                onApply={applyCode}
                onDirtyChange={onDirtyChange}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function checkingState(sessionId: string): PreviewHealthReport {
  return {
    channel: "forge:preview-health",
    version: 1,
    sessionId,
    status: "checking",
    hasMeaningfulContent: false,
    interactiveControls: 0,
    forms: 0,
    issues: [],
    reportedAt: Date.now(),
  };
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4c1.2 11.7 8.3 18.8 20 20-11.7 1.2-18.8 8.3-20 20-1.2-11.7-8.3-18.8-20-20C15.7 22.8 22.8 15.7 24 4Z" />
      <path d="M39 4c.4 3.1 1.9 4.6 5 5-3.1.4-4.6 1.9-5 5-.4-3.1-1.9-4.6-5-5 3.1-.4 4.6-1.9 5-5Z" />
    </svg>
  );
}
