"use client";

import type { PreviewHealthReport, PreviewHealthState } from "@/types/preview-health";

export function PreviewHealth({
  state,
  onRepair,
  onRetry,
  repairDisabled = false,
}: {
  state: PreviewHealthState;
  onRepair?: (report: PreviewHealthReport) => void;
  onRetry?: () => void;
  repairDisabled?: boolean;
}) {
  if (state.status === "checking") {
    return (
      <section className="preview-health" data-status="checking" aria-label="Preview health" aria-live="polite">
        <p className="preview-health-status">Checking preview…</p>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="preview-health" data-status="unavailable" aria-label="Preview health" aria-live="polite">
        <p className="preview-health-status">Preview check unavailable</p>
        {onRetry ? (
          <button className="preview-health-action" type="button" onClick={onRetry}>
            Run check again
          </button>
        ) : null}
      </section>
    );
  }

  if (state.status === "healthy") {
    return (
      <section className="preview-health" data-status="healthy" aria-label="Preview health" aria-live="polite">
        <p className="preview-health-status">Runtime check passed</p>
        <PreviewHealthFacts report={state} />
      </section>
    );
  }

  const issues = state.issues.slice(0, 5);
  const issueCount = issues.length;

  return (
    <section className="preview-health" data-status="issues" aria-label="Preview health" aria-live="polite">
      <p className="preview-health-status">
        {issueCount} preview issue{issueCount === 1 ? "" : "s"} detected
      </p>
      {issueCount > 0 ? (
        <button
          className="preview-health-action"
          type="button"
          disabled={repairDisabled || !onRepair}
          onClick={() => onRepair?.(state)}
        >
          Ask AI to fix
        </button>
      ) : null}
      <ul
        className="preview-health-issues"
        aria-label="Preview issues"
        tabIndex={0}
        style={{ maxBlockSize: "min(5rem, 16dvh)", overflowY: "auto" }}
      >
        {issues.map((issue, index) => (
          <li key={`${issue.message}-${index}`}>{issue.message}</li>
        ))}
      </ul>
      <PreviewHealthFacts report={state} />
    </section>
  );
}

function PreviewHealthFacts({ report }: { report: PreviewHealthReport }) {
  return (
    <ul className="preview-health-facts" aria-label="Preview health facts">
      <li>Rendered content: {report.hasMeaningfulContent ? "yes" : "no"}</li>
      <li>Interaction wiring: {interactionWiring(report)}</li>
      <li>Controls found: {report.interactiveControls}</li>
      <li>Forms found: {report.forms}</li>
    </ul>
  );
}

function interactionWiring(report: PreviewHealthReport) {
  if (report.interactionCoverage === "unknown") return "Manual verification needed";
  if (report.interactionCoverage === "none") return "No app actions detected";

  const wired = report.wiredActions + report.wiredForms;
  const advertised = report.advertisedActions + report.advertisedForms;
  return `${wired}/${advertised} detected`;
}
