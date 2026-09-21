import type { AppCode, GenerationMetadata, Message } from "@/types/ai";

export type RevisionSource =
  | "initial"
  | "refinement"
  | "manual"
  | "restore"
  | "auto_fix";

export interface ProjectRevision extends AppCode {
  id: string;
  source: RevisionSource;
  createdAt: number;
  title: string;
  description: string;
  suggestions: string[];
  generationMetadata?: GenerationMetadata;
}

export interface Project extends AppCode {
  id: string;
  title: string;
  description: string;
  messages: Message[];
  suggestions: string[];
  generationMetadata?: GenerationMetadata;
  createdAt: number;
  updatedAt: number;
  revisionSource: RevisionSource;
  revisionCreatedAt: number;
  revisions: ProjectRevision[];
}
