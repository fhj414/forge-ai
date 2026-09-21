import { z } from "zod";

import {
  PREVIEW_HEALTH_CHANNEL,
  PREVIEW_HEALTH_VERSION,
  type PreviewHealthIssue,
  type PreviewHealthReport,
} from "../types/preview-health";

const issueSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    source: z.string().max(500).optional(),
    line: z.number().int().nonnegative().optional(),
    column: z.number().int().nonnegative().optional(),
    stack: z.string().max(1_500).optional(),
  })
  .strict();

const reportSchema = z
  .object({
    channel: z.literal(PREVIEW_HEALTH_CHANNEL),
    version: z.literal(PREVIEW_HEALTH_VERSION),
    sessionId: z.string().trim().min(1).max(128),
    status: z.enum(["checking", "healthy", "issues"]),
    hasMeaningfulContent: z.boolean(),
    interactiveControls: z.number().int().nonnegative().max(10_000),
    forms: z.number().int().nonnegative().max(10_000),
    issues: z.array(issueSchema).max(5),
    reportedAt: z.number().int().nonnegative(),
  })
  .strict();

export { PREVIEW_HEALTH_CHANNEL, PREVIEW_HEALTH_VERSION };

export function parsePreviewHealthMessage(
  input: unknown,
  expectedSessionId: string,
): PreviewHealthReport | null {
  if (typeof expectedSessionId !== "string" || expectedSessionId.length > 128) return null;

  const result = reportSchema.safeParse(input);
  if (!result.success || result.data.sessionId !== expectedSessionId) return null;

  if (result.data.status !== "issues" && result.data.issues.length !== 0) {
    return null;
  }

  return result.data;
}

function issueLocation(issue: PreviewHealthIssue): string {
  const source = issue.source?.trim();
  const line = issue.line;
  const column = issue.column;

  if (!source && line === undefined && column === undefined) return "location unknown";

  const location = source ?? "unknown source";
  if (line === undefined) return location;
  if (column === undefined) return `${location}:${line}`;
  return `${location}:${line}:${column}`;
}

function repairInstructions(): string {
  return [
    "Preserve useful behavior; change only what is needed to resolve the detected preview runtime issue.",
    "Return a complete artifact that can be rendered as-is.",
    "Do not hide errors or remove useful diagnostics.",
  ].join(" ");
}

export function buildPreviewRepairPrompt(report: PreviewHealthReport): {
  requestPrompt: string;
  displayPrompt: string;
} {
  const diagnostics = report.issues
    .map((issue, index) => `${index + 1}. ${issue.message.trim()} (${issueLocation(issue)})`)
    .join("\n");
  const facts = [
    `Preview health status: ${report.status}.`,
    `Preview rendered meaningful content: ${report.hasMeaningfulContent ? "yes" : "no"}.`,
    `Preview interactive controls: ${report.interactiveControls}.`,
    `Preview forms: ${report.forms}.`,
  ].join("\n");
  const instructions = repairInstructions();
  const prefix = `Repair the preview runtime issues below.\n${facts}\nDetected issues:\n${diagnostics || "none"}`;
  const availablePrefixLength = Math.max(0, 4_000 - instructions.length - 2);
  const requestPrompt = `${prefix.slice(0, availablePrefixLength)}\n\n${instructions}`;

  return {
    requestPrompt,
    displayPrompt: `Fix ${report.issues.length} detected preview runtime issue${report.issues.length === 1 ? "" : "s"}`,
  };
}
