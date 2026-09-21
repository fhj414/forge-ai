"use client";

import { useMemo, useState } from "react";

import { AppHeader } from "@/components/app-header";
import {
  ChatPanel,
  type ExamplePrompt,
} from "@/components/chat-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { ProjectHistory } from "@/components/project-history";
import { PromptInput } from "@/components/prompt-input";
import { useGenerator } from "@/hooks/use-generator";
import { useProjects } from "@/hooks/use-projects";
import { analyzeBuild } from "@/lib/build-summary";

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
    prompt:
      "Build a minimal task manager with filters, priority levels and progress statistics.",
  },
  {
    label: "Expense Tracker",
    eyebrow: "Personal finance",
    prompt:
      "Create a personal expense tracker with category charts, monthly spending and recent transactions.",
  },
];

export function BuilderWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasUnsavedCode, setHasUnsavedCode] = useState(false);
  const projectState = useProjects();
  const generator = useGenerator();

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

  async function submitPrompt(explicitPrompt?: string) {
    const nextPrompt = (explicitPrompt ?? prompt).trim();
    if (!nextPrompt || generator.isGenerating || hasUnsavedCode) return;

    setPrompt("");
    setPendingPrompt(nextPrompt);
    const project = projectState.currentProject;
    const result = await generator.generate({
      prompt: nextPrompt,
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
      projectState.commitGeneration(result, nextPrompt);
      setPendingPrompt("");
    }
  }

  function startNewProject() {
    projectState.newProject();
    generator.reset();
    setPrompt("");
    setPendingPrompt("");
    setHasUnsavedCode(false);
  }

  function openProject(id: string) {
    projectState.restoreProject(id);
    generator.reset();
    setPrompt("");
    setPendingPrompt("");
    setHasUnsavedCode(false);
    setHistoryOpen(false);
  }

  return (
    <main className="app-shell">
      <AppHeader
        projectTitle={projectState.currentProject?.title}
        disabled={generator.isGenerating || hasUnsavedCode}
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
            disabled={generator.isGenerating || hasUnsavedCode}
            onExample={setPrompt}
            onRetry={() => void submitPrompt(pendingPrompt)}
            onSuggestion={(suggestion) => void submitPrompt(suggestion)}
          />
          <div className="composer-region">
            <PromptInput
              value={prompt}
              isRefinement={Boolean(projectState.currentProject)}
              disabled={generator.isGenerating}
              blockedReason={
                hasUnsavedCode
                  ? "Apply or discard code changes before refining."
                  : undefined
              }
              onChange={setPrompt}
              onSubmit={() => void submitPrompt()}
            />
            <p className="composer-disclaimer">
              AI can make mistakes. Review generated code before publishing.
            </p>
          </div>
        </section>

        <PreviewPanel
          project={projectState.currentProject}
          disabled={generator.isGenerating}
          onApplyCode={projectState.updateCurrentProject}
          onDirtyChange={setHasUnsavedCode}
        />
      </div>

      <ProjectHistory
        open={historyOpen}
        projects={projectState.projects}
        currentProjectId={projectState.currentProject?.id}
        onClose={() => setHistoryOpen(false)}
        onOpen={openProject}
        onDelete={projectState.deleteProject}
      />
    </main>
  );
}
