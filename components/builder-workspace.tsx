"use client";

import { useMemo, useState } from "react";

import { AppHeader } from "@/components/app-header";
import {
  ChatPanel,
  type ExamplePrompt,
} from "@/components/chat-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { ProjectHistory } from "@/components/project-history";
import { VersionHistory } from "@/components/version-history";
import { PromptInput } from "@/components/prompt-input";
import { useGenerator } from "@/hooks/use-generator";
import { useProjects } from "@/hooks/use-projects";
import { analyzeBuild } from "@/lib/build-summary";
import { buildPreviewRepairPrompt } from "@/lib/preview-health";
import type { PreviewHealthReport } from "@/types/preview-health";

interface GenerationIntent {
  requestPrompt: string;
  displayPrompt?: string;
  revisionSource?: "refinement" | "auto_fix";
}

const DEFAULT_PROMPT =
  "Build a minimal task manager with filters, priority levels and progress statistics.";

const EXAMPLES: ExamplePrompt[] = [
  {
    label: "SaaS Dashboard",
    eyebrow: "Analytics",
    prompt:
      "Create a modern SaaS analytics dashboard with revenue metrics, active users, conversion rate and recent activities.",
  },
  {
    label: "Task Manager",
    eyebrow: "Productivity",
    prompt: DEFAULT_PROMPT,
  },
  {
    label: "Expense Tracker",
    eyebrow: "Personal finance",
    prompt:
      "Create a personal expense tracker with category charts, monthly spending and recent transactions.",
  },
];

export function BuilderWorkspace() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [promptIsPreset, setPromptIsPreset] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [pendingIntent, setPendingIntent] = useState<GenerationIntent | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [hasUnsavedCode, setHasUnsavedCode] = useState(false);
  const projectState = useProjects();
  const generator = useGenerator();
  const composerPrompt =
    !projectState.hydrated || (projectState.currentProject && promptIsPreset)
      ? ""
      : prompt;

  const buildSummary = useMemo(
    () =>
      projectState.currentProject && projectState.persistenceState !== "pending"
        ? analyzeBuild(
            projectState.currentProject,
            projectState.persistenceState === "saved",
          )
        : null,
    [projectState.currentProject, projectState.persistenceState],
  );

  async function submitPrompt(intent: GenerationIntent) {
    const requestPrompt = intent.requestPrompt.trim();
    const displayPrompt = (intent.displayPrompt ?? requestPrompt).trim();
    if (
      !projectState.hydrated ||
      !requestPrompt ||
      !displayPrompt ||
      generator.isGenerating ||
      hasUnsavedCode
    ) {
      return;
    }

    setPrompt("");
    setPromptIsPreset(false);
    setPendingPrompt(displayPrompt);
    setPendingIntent({ ...intent, requestPrompt, displayPrompt });
    const project = projectState.currentProject;
    const result = await generator.generate({
      prompt: requestPrompt,
      currentCode: project
        ? {
            html: project.html,
            css: project.css,
            javascript: project.javascript,
          }
        : undefined,
      conversation: project?.messages.map(({ role, content }) => ({
        role,
        content,
      })),
    });

    if (result) {
      projectState.commitGeneration(result, displayPrompt, intent.revisionSource);
      setPendingPrompt("");
      setPendingIntent(null);
    } else {
      setPrompt(displayPrompt);
    }
  }

  function repairPreview(report: PreviewHealthReport) {
    if (report.status !== "issues" || report.issues.length === 0) return;

    const repairPrompt = buildPreviewRepairPrompt(report);
    void submitPrompt({ ...repairPrompt, revisionSource: "auto_fix" });
  }

  function startNewProject() {
    projectState.newProject();
    generator.reset();
    setPrompt(DEFAULT_PROMPT);
    setPromptIsPreset(true);
    setPendingPrompt("");
    setPendingIntent(null);
    setHasUnsavedCode(false);
    setVersionHistoryOpen(false);
  }

  function openProject(id: string) {
    projectState.restoreProject(id);
    generator.reset();
    setPrompt("");
    setPromptIsPreset(false);
    setPendingPrompt("");
    setPendingIntent(null);
    setHasUnsavedCode(false);
    setHistoryOpen(false);
    setVersionHistoryOpen(false);
  }

  function deleteProject(id: string) {
    const deletingCurrentProject = projectState.currentProject?.id === id;
    projectState.deleteProject(id);

    if (!deletingCurrentProject) return;

    generator.reset();
    setPrompt(DEFAULT_PROMPT);
    setPromptIsPreset(true);
    setPendingPrompt("");
    setPendingIntent(null);
    setHasUnsavedCode(false);
    setVersionHistoryOpen(false);
  }

  return (
    <main className="app-shell">
      <AppHeader
        projectTitle={projectState.currentProject?.title}
        disabled={
          !projectState.hydrated || generator.isGenerating || hasUnsavedCode
        }
        onNewProject={startNewProject}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <div className="workspace-grid">
        <section className="chat-workspace" aria-label="Forge conversation">
          <ChatPanel
            project={projectState.currentProject}
            pendingPrompt={pendingPrompt}
            phase={generator.phase}
            errorMessage={generator.error?.message}
            buildSummary={buildSummary}
            examples={EXAMPLES}
            disabled={
              !projectState.hydrated || generator.isGenerating || hasUnsavedCode
            }
            onExample={(examplePrompt) => {
              setPrompt(examplePrompt);
              setPromptIsPreset(false);
            }}
            onRetry={() => {
              if (pendingIntent) void submitPrompt(pendingIntent);
            }}
            onSuggestion={(suggestion) =>
              void submitPrompt({ requestPrompt: suggestion })
            }
          />
          <div className="composer-region">
            <PromptInput
              value={composerPrompt}
              isRefinement={Boolean(projectState.currentProject)}
              disabled={!projectState.hydrated || generator.isGenerating}
              blockedReason={
                hasUnsavedCode
                  ? "Apply or discard code changes before refining."
                  : undefined
              }
              onChange={(value) => {
                setPrompt(value);
                setPromptIsPreset(false);
              }}
              onSubmit={() =>
                void submitPrompt({ requestPrompt: composerPrompt })
              }
            />
            <p className="composer-disclaimer">
              AI can make mistakes. Review generated code before publishing.
            </p>
          </div>
        </section>

        <PreviewPanel
          project={projectState.currentProject}
          disabled={generator.isGenerating}
          versionHistoryDisabled={generator.isGenerating || hasUnsavedCode}
          onApplyCode={projectState.updateCurrentProject}
          onDirtyChange={setHasUnsavedCode}
          onOpenVersionHistory={() => setVersionHistoryOpen(true)}
          repairDisabled={generator.isGenerating || hasUnsavedCode}
          onRepair={repairPreview}
        />
      </div>

      <ProjectHistory
        open={historyOpen}
        projects={projectState.projects}
        currentProjectId={projectState.currentProject?.id}
        onClose={() => setHistoryOpen(false)}
        onOpen={openProject}
        onDelete={deleteProject}
      />
      <VersionHistory
        open={versionHistoryOpen}
        project={projectState.currentProject}
        disabled={generator.isGenerating || hasUnsavedCode}
        onClose={() => setVersionHistoryOpen(false)}
        onRestore={projectState.restoreProjectVersion}
      />
    </main>
  );
}
