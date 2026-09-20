"use client";

import { Check, Clipboard, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { AppCode } from "@/types/ai";

type CodeTab = "html" | "css" | "javascript";

const TAB_LABELS: Record<CodeTab, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
};

export function CodeViewer({ code }: { code: AppCode }) {
  const [tab, setTab] = useState<CodeTab>("html");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(code[tab]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
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
      </div>
      <pre className="code-block">
        <code>{code[tab]}</code>
      </pre>
    </div>
  );
}
