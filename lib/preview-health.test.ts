import { describe, expect, it } from "vitest";

import {
  PREVIEW_HEALTH_CHANNEL,
  PREVIEW_HEALTH_VERSION,
  buildPreviewRepairPrompt,
  parsePreviewHealthMessage,
} from "./preview-health";

const issue = {
  message: "Chart is not a constructor",
  source: "about:srcdoc",
  line: 42,
  column: 7,
  stack: "TypeError: Chart is not a constructor",
};

const report = {
  channel: PREVIEW_HEALTH_CHANNEL,
  version: PREVIEW_HEALTH_VERSION,
  sessionId: "preview-session",
  status: "issues" as const,
  hasMeaningfulContent: true,
  interactiveControls: 3,
  forms: 1,
  issues: [issue],
  reportedAt: 1_700_000_000_000,
};

describe("preview health protocol", () => {
  it("accepts a valid report and rejects stale or invalid reports", () => {
    expect(parsePreviewHealthMessage(report, "preview-session")).toEqual(report);
    expect(parsePreviewHealthMessage(report, "stale-session")).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, channel: "other" }, "preview-session")).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, issues: Array(6).fill(issue) }, "preview-session")).toBeNull();
  });

  it("rejects malformed, overlong, negative, unknown, and inconsistent reports", () => {
    expect(parsePreviewHealthMessage({ ...report, sessionId: "x".repeat(129) }, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, issues: [{ ...issue, message: "x".repeat(501) }] }, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, interactiveControls: -1 }, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, status: "broken" }, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage({ ...report, status: "healthy", issues: [issue] }, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage(null, report.sessionId)).toBeNull();
    expect(parsePreviewHealthMessage("not a report", report.sessionId)).toBeNull();
  });

  it("builds a bounded repair prompt with normalized facts and a concise display prompt", () => {
    const prompts = buildPreviewRepairPrompt({
      ...report,
      issues: [{ ...issue, message: "  Chart is not a constructor  " }],
    });

    expect(prompts.requestPrompt).toContain("Chart is not a constructor");
    expect(prompts.requestPrompt).toContain("about:srcdoc:42:7");
    expect(prompts.requestPrompt).toContain("rendered meaningful content: yes");
    expect(prompts.requestPrompt).toContain("interactive controls: 3");
    expect(prompts.requestPrompt).toContain("forms: 1");
    expect(prompts.requestPrompt).toContain("Preserve useful behavior");
    expect(prompts.requestPrompt).toContain("change only what is needed");
    expect(prompts.requestPrompt).toContain("complete artifact");
    expect(prompts.requestPrompt).toContain("Do not hide errors");
    expect(prompts.requestPrompt).not.toContain(issue.stack);
    expect(prompts.displayPrompt).toBe("Fix 1 detected preview runtime issue");
  });

  it("caps the provider prompt even when issue messages are large", () => {
    const prompts = buildPreviewRepairPrompt({
      ...report,
      issues: Array.from({ length: 5 }, (_, index) => ({
        message: `issue ${index} ${"x".repeat(500)}`,
        source: "about:srcdoc",
        line: index,
        column: index,
      })),
    });

    expect(prompts.requestPrompt.length).toBeLessThanOrEqual(4_000);
  });
});
