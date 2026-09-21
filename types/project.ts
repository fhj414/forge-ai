import type { AppCode, GenerationMetadata, Message } from "@/types/ai";

export interface Project extends AppCode {
  id: string;
  title: string;
  description: string;
  messages: Message[];
  suggestions: string[];
  generationMetadata?: GenerationMetadata;
  createdAt: number;
  updatedAt: number;
}
