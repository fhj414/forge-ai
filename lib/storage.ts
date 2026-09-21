import { z } from "zod";

import type { Project } from "@/types/project";

export const PROJECTS_STORAGE_KEY = "forge-ai-projects";
export const CURRENT_PROJECT_STORAGE_KEY = "forge-ai-current-project";

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.number(),
  changes: z.array(z.string()).optional(),
});

const generationMetadataSchema = z.object({
  model: z.string(),
  durationMs: z.number().int().nonnegative(),
  kind: z.enum(["initial", "refinement"]),
  codeLines: z.number().int().nonnegative(),
  codeBytes: z.number().int().nonnegative(),
  schemaValidated: z.literal(true),
});

const revisionSourceSchema = z.enum([
  "initial",
  "refinement",
  "manual",
  "restore",
  "auto_fix",
]);

const projectRevisionSchema = z.object({
  id: z.string(),
  source: revisionSourceSchema,
  createdAt: z.number(),
  title: z.string(),
  description: z.string(),
  html: z.string(),
  css: z.string(),
  javascript: z.string(),
  suggestions: z.array(z.string()),
  generationMetadata: generationMetadataSchema.optional(),
});

const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  html: z.string(),
  css: z.string(),
  javascript: z.string(),
  messages: z.array(messageSchema),
  suggestions: z.array(z.string()),
  generationMetadata: generationMetadataSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  revisionSource: revisionSourceSchema.optional(),
  revisionCreatedAt: z.number().optional(),
  revisions: z.array(projectRevisionSchema).optional(),
}).transform((project) => ({
  ...project,
  revisionSource: project.revisionSource ?? "initial",
  revisionCreatedAt: project.revisionCreatedAt ?? project.updatedAt,
  revisions: project.revisions ?? [],
}));

const projectsSchema = z.array(projectSchema);

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof window !== "undefined") {
    return window.localStorage;
  }

  return undefined;
}

export function loadProjects(storage?: Storage): Project[] {
  try {
    const value = resolveStorage(storage)?.getItem(PROJECTS_STORAGE_KEY);
    if (!value) {
      return [];
    }

    const result = projectsSchema.safeParse(JSON.parse(value));
    return result.success ? (result.data as Project[]) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[], storage?: Storage) {
  try {
    const target = resolveStorage(storage);
    if (!target) {
      return false;
    }

    target.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrentProjectId(storage?: Storage) {
  try {
    return resolveStorage(storage)?.getItem(CURRENT_PROJECT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveCurrentProjectId(id: string | null, storage?: Storage) {
  try {
    const target = resolveStorage(storage);
    if (!target) {
      return false;
    }

    if (id) {
      target.setItem(CURRENT_PROJECT_STORAGE_KEY, id);
    } else {
      target.removeItem(CURRENT_PROJECT_STORAGE_KEY);
    }

    return true;
  } catch {
    return false;
  }
}
