export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  changes?: string[];
}

export interface AppCode {
  html: string;
  css: string;
  javascript: string;
}

export interface GeneratedApp extends AppCode {
  title: string;
  summary: string;
  changes: string[];
  suggestions: string[];
}

export interface GenerationMetadata {
  model: string;
  durationMs: number;
  kind: "initial" | "refinement";
  codeLines: number;
  codeBytes: number;
  schemaValidated: true;
}

export interface GeneratedBuild extends GeneratedApp {
  generationMetadata: GenerationMetadata;
}

export interface GenerateRequest {
  prompt: string;
  currentCode?: AppCode;
  conversation?: Pick<Message, "role" | "content">[];
}

export type GenerateErrorCode =
  | "AI_NOT_CONFIGURED"
  | "INVALID_REQUEST"
  | "INVALID_MODEL_RESPONSE"
  | "AI_TIMEOUT"
  | "AI_UPSTREAM_ERROR"
  | "NETWORK_ERROR";

export interface GenerateErrorPayload {
  error: {
    code: GenerateErrorCode;
    message: string;
  };
}
