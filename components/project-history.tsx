"use client";

import { Clock3, FolderOpen, Trash2, X } from "lucide-react";

import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/project";

interface ProjectHistoryProps {
  open: boolean;
  projects: Project[];
  currentProjectId?: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectHistory({
  open,
  projects,
  currentProjectId,
  onClose,
  onOpen,
  onDelete,
}: ProjectHistoryProps) {
  if (!open) return null;

  const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Close project history"
      />
      <aside className="history-drawer" role="dialog" aria-label="Project history">
        <div className="drawer-header">
          <div>
            <span className="section-label">
              <Clock3 size={13} /> Workspace
            </span>
            <h2>Project history</h2>
            <p>Everything is saved in this browser.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={17} />
            <span className="sr-only">Close history</span>
          </button>
        </div>

        <div className="history-list">
          {sortedProjects.length === 0 ? (
            <div className="history-empty">
              <FolderOpen size={22} />
              <strong>No projects yet</strong>
              <p>Your first generated app will show up here.</p>
            </div>
          ) : (
            sortedProjects.map((project) => (
              <article
                key={project.id}
                className="history-item"
                data-current={project.id === currentProjectId}
              >
                <button
                  type="button"
                  className="history-open"
                  onClick={() => onOpen(project.id)}
                  aria-label={`Open ${project.title}`}
                >
                  <span className="history-project-icon">
                    <FolderOpen size={15} />
                  </span>
                  <span>
                    <strong>{project.title}</strong>
                    <p>{project.description}</p>
                    <small>{formatRelativeTime(project.updatedAt)}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="history-delete"
                  onClick={() => {
                    if (window.confirm(`Delete “${project.title}”?`)) {
                      onDelete(project.id);
                    }
                  }}
                  aria-label={`Delete ${project.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
