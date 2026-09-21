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
import type { Project } from "@/types/project";

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
    (result: GeneratedBuild, prompt: string) => {
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
              ? {
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
                  updatedAt: now,
                }
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
            ? {
                ...project,
                html: code.html,
                css: code.css,
                javascript: code.javascript,
                updatedAt: Math.max(Date.now(), project.updatedAt + 1),
              }
            : project,
        ),
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
  };
}
