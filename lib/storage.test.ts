import { describe, expect, it } from "vitest";

import {
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
};

describe("project storage", () => {
  it("round-trips valid projects and the active id", () => {
    const storage = new MemoryStorage();

    expect(saveProjects([project], storage)).toBe(true);
    expect(saveCurrentProjectId(project.id, storage)).toBe(true);

    expect(loadProjects(storage)).toEqual([project]);
    expect(loadCurrentProjectId(storage)).toBe(project.id);
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
