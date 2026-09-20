import { Clock3, GitBranch, Hammer, Plus } from "lucide-react";

interface AppHeaderProps {
  projectTitle?: string;
  disabled: boolean;
  onNewProject: () => void;
  onOpenHistory: () => void;
}

export function AppHeader({
  projectTitle,
  disabled,
  onNewProject,
  onOpenHistory,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <Hammer size={15} strokeWidth={2.4} />
        </span>
        <span className="brand-name">Forge</span>
        <span className="brand-badge">AI</span>
        {projectTitle ? (
          <>
            <span className="header-divider" aria-hidden="true" />
            <span className="header-project-title">{projectTitle}</span>
          </>
        ) : null}
      </div>

      <nav className="header-actions" aria-label="Workspace actions">
        <span className="save-indicator">
          <span className="save-dot" /> Local autosave
        </span>
        <button
          className="header-button"
          type="button"
          disabled={disabled}
          onClick={onNewProject}
          aria-label="New project"
        >
          <Plus size={15} />
          <span>New project</span>
        </button>
        <button
          className="header-button"
          type="button"
          disabled={disabled}
          onClick={onOpenHistory}
          aria-label="Open history"
        >
          <Clock3 size={15} />
          <span>History</span>
        </button>
        <a
          className="icon-button github-link"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Open GitHub"
        >
          <GitBranch size={17} />
        </a>
      </nav>
    </header>
  );
}
