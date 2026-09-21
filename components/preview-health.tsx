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
        <p className="preview-health-status">Preview healthy</p>
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
      <ul className="preview-health-issues">
        {issues.map((issue, index) => (
          <li key={`${issue.message}-${index}`}>{issue.message}</li>
        ))}
      </ul>
      <PreviewHealthFacts report={state} />
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
    </section>
  );
}

function PreviewHealthFacts({ report }: { report: PreviewHealthReport }) {
  return (
    <ul className="preview-health-facts" aria-label="Preview health facts">
      <li>Rendered content: {report.hasMeaningfulContent ? "yes" : "no"}</li>
      <li>Controls: {report.interactiveControls}</li>
      <li>Forms: {report.forms}</li>
    </ul>
  );
}
