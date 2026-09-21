import { describe, expect, it } from "vitest";

import {
  PROJECTS_STORAGE_KEY,
  loadCurrentProjectId,
  loadProjects,
  saveCurrentProjectId,
  saveProjects,
} from "@/lib/storage";
import type { Project } from "@/types/project";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const project: Project = {
  id: "project-1",
  title: "Expense Orbit",
  description: "A personal finance dashboard.",
  html: "<main>Expenses</main>",
  css: "body{}",
  javascript: "",
  messages: [],
  suggestions: ["Add export"],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  revisionSource: "initial",
  revisionCreatedAt: 1_700_000_000_000,
  revisions: [],
};

const projectWithMetadata: Project = {
  ...project,
  id: "project-with-metadata",
  generationMetadata: {
    model: "forge-test",
    durationMs: 842,
    kind: "initial",
    codeLines: 3,
    codeBytes: 59,
    schemaValidated: true,
  },
};

const autoFixProject = {
  ...project,
  revisionSource: "auto_fix",
  revisionCreatedAt: 1_700_000_002_000,
  revisions: [
    {
      id: "before-auto-fix",
      source: "auto_fix",
      createdAt: 1_700_000_001_000,
      title: "Expense Orbit repair",
      description: "A repaired personal finance dashboard.",
      html: "<main>Repaired expenses</main>",
      css: "body { color: navy; }",
      javascript: "console.log('repaired');",
      suggestions: ["Add export"],
    },
  ],
} satisfies Project;

describe("project storage", () => {
  it("round-trips valid projects and the active id", () => {
    const storage = new MemoryStorage();

    expect(saveProjects([project], storage)).toBe(true);
    expect(saveCurrentProjectId(project.id, storage)).toBe(true);

    expect(loadProjects(storage)).toEqual([project]);
    expect(loadCurrentProjectId(storage)).toBe(project.id);
  });

  it("round-trips trusted generation metadata while accepting older projects without it", () => {
    const storage = new MemoryStorage();

    expect(saveProjects([projectWithMetadata, project], storage)).toBe(true);
    expect(loadProjects(storage)).toEqual([projectWithMetadata, project]);
  });

  it("round-trips auto-fix sources for the current and historical artifact", () => {
    const storage = new MemoryStorage();

    expect(saveProjects([autoFixProject], storage)).toBe(true);
    expect(loadProjects(storage)).toEqual([autoFixProject]);
  });

  it("migrates saved projects without revision history to initial revision defaults", () => {
    const storage = new MemoryStorage();
    const legacyProject: Partial<Project> = { ...project };
    delete legacyProject.revisionSource;
    delete legacyProject.revisionCreatedAt;
    delete legacyProject.revisions;
    storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([legacyProject]));

    expect(loadProjects(storage)).toEqual([
      {
        ...project,
        revisionSource: "initial",
        revisionCreatedAt: project.updatedAt,
        revisions: [],
      },
    ]);
  });

  it("returns an empty list for corrupted or structurally invalid data", () => {
    const storage = new MemoryStorage();
    storage.setItem("forge-ai-projects", "not-json");
    expect(loadProjects(storage)).toEqual([]);

    storage.setItem("forge-ai-projects", JSON.stringify([{ title: "Incomplete" }]));
    expect(loadProjects(storage)).toEqual([]);
  });

  it("reports write failure instead of throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };

    expect(saveProjects([project], storage)).toBe(false);
    expect(saveCurrentProjectId(project.id, storage)).toBe(false);
  });
});
