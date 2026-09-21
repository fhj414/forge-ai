"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadCurrentProjectId,
  loadProjects,
  saveCurrentProjectId,
  saveProjects,
} from "@/lib/storage";
import { createId } from "@/lib/utils";
import type { AppCode, GeneratedBuild } from "@/types/ai";
import type { Project, ProjectRevision } from "@/types/project";

const MAX_PRIOR_REVISIONS = 10;

function snapshotProject(project: Project): ProjectRevision {
  return {
    id: createId("version"),
    source: project.revisionSource,
    createdAt: project.revisionCreatedAt,
    title: project.title,
    description: project.description,
    html: project.html,
    css: project.css,
    javascript: project.javascript,
    suggestions: project.suggestions,
    generationMetadata: project.generationMetadata,
  };
}

function addSnapshot(project: Project, revisions = project.revisions) {
  return [snapshotProject(project), ...revisions].slice(0, MAX_PRIOR_REVISIONS);
}

function nextUpdatedAt(project: Project) {
  return Math.max(Date.now(), project.updatedAt + 1);
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceState, setPersistenceState] = useState<
    "pending" | "saved" | "error"
  >("pending");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storedProjects = loadProjects();
      const storedId = loadCurrentProjectId();
      setProjects(storedProjects);
      setCurrentProjectId(
        storedId && storedProjects.some((project) => project.id === storedId)
          ? storedId
          : null,
      );
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const projectsSaved = saveProjects(projects);
    const currentProjectSaved = saveCurrentProjectId(currentProjectId);
    queueMicrotask(() => {
      setPersistenceState(
        projectsSaved && currentProjectSaved ? "saved" : "error",
      );
    });
  }, [currentProjectId, hydrated, projects]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );

  const commitGeneration = useCallback(
    (
      result: GeneratedBuild,
      prompt: string,
      source: "refinement" | "auto_fix" = "refinement",
    ) => {
      setPersistenceState("pending");
      const now = Date.now();
      const userMessage = {
        id: createId("message"),
        role: "user" as const,
        content: prompt,
        createdAt: now,
      };
      const assistantMessage = {
        id: createId("message"),
        role: "assistant" as const,
        content: result.summary,
        changes: result.changes,
        createdAt: now + 1,
      };

      if (currentProjectId) {
        setProjects((existing) =>
          existing.map((project) =>
            project.id === currentProjectId
              ? (() => {
                  const updatedAt = nextUpdatedAt(project);
                  return {
                    ...project,
                    title: result.title,
                    description: result.summary,
                    html: result.html,
                    css: result.css,
                    javascript: result.javascript,
                    suggestions: result.suggestions,
                    generationMetadata: result.generationMetadata,
                    messages: [
                      ...project.messages,
                      userMessage,
                      assistantMessage,
                    ],
                    revisionSource: source,
                    revisionCreatedAt: updatedAt,
                    revisions: addSnapshot(project),
                    updatedAt,
                  };
                })()
              : project,
          ),
        );
        return;
      }

      const project: Project = {
        id: createId("project"),
        title: result.title,
        description: result.summary,
        html: result.html,
        css: result.css,
        javascript: result.javascript,
        suggestions: result.suggestions,
        generationMetadata: result.generationMetadata,
        messages: [userMessage, assistantMessage],
        createdAt: now,
        updatedAt: now,
        revisionSource: "initial",
        revisionCreatedAt: now,
        revisions: [],
      };

      setProjects((existing) => [project, ...existing]);
      setCurrentProjectId(project.id);
    },
    [currentProjectId],
  );

  const newProject = useCallback(() => {
    setPersistenceState("pending");
    setCurrentProjectId(null);
  }, []);

  const restoreProject = useCallback(
    (id: string) => {
      if (projects.some((project) => project.id === id)) {
        setPersistenceState("pending");
        setCurrentProjectId(id);
      }
    },
    [projects],
  );

  const deleteProject = useCallback(
    (id: string) => {
      setPersistenceState("pending");
      setProjects((existing) => existing.filter((project) => project.id !== id));
      if (currentProjectId === id) {
        setCurrentProjectId(null);
      }
    },
    [currentProjectId],
  );

  const updateCurrentProject = useCallback(
    (code: AppCode) => {
      if (!currentProjectId) return;

      setPersistenceState("pending");
      setProjects((existing) =>
        existing.map((project) =>
          project.id === currentProjectId
            ? (() => {
                const updatedAt = nextUpdatedAt(project);
                return {
                  ...project,
                  html: code.html,
                  css: code.css,
                  javascript: code.javascript,
                  revisionSource: "manual" as const,
                  revisionCreatedAt: updatedAt,
                  revisions: addSnapshot(project),
                  updatedAt,
                };
              })()
            : project,
        ),
      );
    },
    [currentProjectId],
  );

  const restoreProjectVersion = useCallback(
    (versionId: string) => {
      if (!currentProjectId) return;

      setPersistenceState("pending");
      setProjects((existing) =>
        existing.map((project) => {
          if (project.id !== currentProjectId) return project;

          const revision = project.revisions.find((item) => item.id === versionId);
          if (!revision) return project;

          const updatedAt = nextUpdatedAt(project);
          return {
            ...project,
            title: revision.title,
            description: revision.description,
            html: revision.html,
            css: revision.css,
            javascript: revision.javascript,
            suggestions: revision.suggestions,
            generationMetadata: revision.generationMetadata,
            revisionSource: "restore",
            revisionCreatedAt: updatedAt,
            revisions: addSnapshot(
              project,
              project.revisions.filter((item) => item.id !== versionId),
            ),
            updatedAt,
          };
        }),
      );
    },
    [currentProjectId],
  );

  return {
    projects,
    currentProject,
    hydrated,
    persistenceState,
    commitGeneration,
    newProject,
    restoreProject,
    deleteProject,
    updateCurrentProject,
    restoreProjectVersion,
  };
}
