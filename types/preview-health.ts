export const PREVIEW_HEALTH_CHANNEL = "forge:preview-health" as const;
export const PREVIEW_HEALTH_VERSION = 1 as const;

export interface PreviewHealthIssue {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface PreviewHealthReport {
  channel: typeof PREVIEW_HEALTH_CHANNEL;
  version: typeof PREVIEW_HEALTH_VERSION;
  sessionId: string;
  status: "checking" | "healthy" | "issues";
  hasMeaningfulContent: boolean;
  interactiveControls: number;
  forms: number;
  issues: PreviewHealthIssue[];
  reportedAt: number;
}

export type PreviewHealthState =
  | PreviewHealthReport
  | { status: "unavailable"; sessionId: string };
