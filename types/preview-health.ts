export const PREVIEW_HEALTH_CHANNEL = "forge:preview-health" as const;
export const PREVIEW_HEALTH_VERSION = 2 as const;

export type PreviewInteractionCoverage =
  | "none"
  | "complete"
  | "incomplete"
  | "unknown";

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
  advertisedActions: number;
  wiredActions: number;
  advertisedForms: number;
  wiredForms: number;
  delegatedActionListeners: number;
  interactionCoverage: PreviewInteractionCoverage;
  issues: PreviewHealthIssue[];
  reportedAt: number;
}

export type PreviewHealthState =
  | PreviewHealthReport
  | { status: "unavailable"; sessionId: string };
