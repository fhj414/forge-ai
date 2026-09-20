import type { AppCode, Message } from "@/types/ai";

export interface Project extends AppCode {
  id: string;
  title: string;
  description: string;
  messages: Message[];
  suggestions: string[];
  createdAt: number;
  updatedAt: number;
}
