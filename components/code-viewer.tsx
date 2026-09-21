"use client";

import { Check, Clipboard, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { AppCode } from "@/types/ai";

type CodeTab = "html" | "css" | "javascript";

const TAB_LABELS: Record<CodeTab, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
};

export function CodeViewer({
  code,
  disabled = false,
  onApply,
  onDirtyChange,
}: {
  code: AppCode;
  disabled?: boolean;
  onApply: (code: AppCode) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<CodeTab>("html");
  const [draft, setDraft] = useState<AppCode>(() => ({
    html: code.html,
    css: code.css,
    javascript: code.javascript,
  }));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const isDirty = useMemo(
    () =>
      draft.html !== code.html ||
      draft.css !== code.css ||
      draft.javascript !== code.javascript,
    [code, draft],
  );

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(draft[tab]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function applyChanges() {
    if (disabled || !isDirty) return;
    onApply({
      html: draft.html,
      css: draft.css,
      javascript: draft.javascript,
    });
  }

  function discardChanges() {
    if (disabled) return;
    setDraft({
      html: code.html,
      css: code.css,
      javascript: code.javascript,
    });
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      applyChanges();
    }
  }

  return (
    <div className="code-viewer">
      <div className="code-toolbar">
        <div className="code-tabs" role="tablist" aria-label="Source files">
          {(Object.keys(TAB_LABELS) as CodeTab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              <span className={`file-dot ${key}`} />
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="code-actions">
          <span className="code-dirty-status" aria-live="polite">
            {isDirty ? "Unsaved changes" : ""}
          </span>
          <button type="button" className="copy-button" onClick={copyCode}>
            {copyState === "copied" ? (
              <Check size={13} />
            ) : copyState === "error" ? (
              <X size={13} />
            ) : (
              <Clipboard size={13} />
            )}
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy code"}
          </button>
          <button
            type="button"
            className="code-action-button"
            disabled={disabled || !isDirty}
            onClick={discardChanges}
          >
            <RotateCcw size={13} />
            Discard
          </button>
          <button
            type="button"
            className="code-action-button primary"
            disabled={disabled || !isDirty}
            title="Apply changes (Cmd/Ctrl + S)"
            onClick={applyChanges}
          >
            <Save size={13} />
            Apply changes
          </button>
        </div>
      </div>
      <textarea
        className="code-editor"
        aria-label={`${TAB_LABELS[tab]} source`}
        value={draft[tab]}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            [tab]: event.target.value,
          }))
        }
        onKeyDown={handleEditorKeyDown}
      />
    </div>
  );
}
