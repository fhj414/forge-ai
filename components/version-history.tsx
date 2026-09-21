"use client";

import { Clock3, History, RotateCcw, X } from "lucide-react";

import type { AppCode } from "@/types/ai";
import type { Project, RevisionSource } from "@/types/project";

const SOURCE_LABELS: Record<RevisionSource, string> = {
  initial: "Initial AI",
  refinement: "AI refinement",
  manual: "Manual edit",
  restore: "Restore",
  auto_fix: "AI auto-fix",
};

function formatVersionTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function codeSize(code: AppCode) {
  return new Blob([code.html, code.css, code.javascript]).size;
}

export function VersionHistory({
  open,
  project,
  disabled = false,
  onClose,
  onRestore,
}: {
  open: boolean;
  project: Project | null;
  disabled?: boolean;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}) {
  if (!open) return null;

  const revisions = project?.revisions ?? [];

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Close version history"
      />
      <aside className="history-drawer version-history-drawer" role="dialog" aria-label="Version history">
        <div className="drawer-header">
          <div>
            <span className="section-label">
              <History size={13} /> Project versions
            </span>
            <h2>Version history</h2>
            <p>Restore a prior artifact. Messages stay intact.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={17} />
            <span className="sr-only">Close version history</span>
          </button>
        </div>

        <div className="history-list version-history-list">
          {project ? (
            <article
              className="version-history-item"
              aria-label="Current version"
              data-current="true"
            >
              <div className="version-history-details">
                <span className="version-source">
                  {SOURCE_LABELS[project.revisionSource]}
                </span>
                <strong>{project.title}</strong>
                <small>{formatVersionTime(project.revisionCreatedAt)}</small>
                <small>{codeSize(project).toLocaleString()} bytes · Current</small>
              </div>
            </article>
          ) : null}
          {revisions.length === 0 ? (
            <div className="history-empty">
              <Clock3 size={22} />
              <strong>No prior versions yet</strong>
              <p>Refinements and applied code edits will appear here.</p>
            </div>
          ) : (
            revisions.map((revision) => (
              <article key={revision.id} className="version-history-item">
                <div className="version-history-details">
                  <span className="version-source">{SOURCE_LABELS[revision.source]}</span>
                  <strong>{revision.title}</strong>
                  <small>{formatVersionTime(revision.createdAt)}</small>
                  <small>{codeSize(revision).toLocaleString()} bytes</small>
                </div>
                <button
                  type="button"
                  className="code-action-button version-restore-button"
                  disabled={disabled}
                  onClick={() => onRestore(revision.id)}
                  aria-label={`Restore ${revision.title}`}
                >
                  <RotateCcw size={13} /> Restore
                </button>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
