import { Check, Circle, LoaderCircle, X } from "lucide-react";

import type { GenerationPhase } from "@/hooks/use-generator";

type StepStatus = "complete" | "running" | "waiting" | "error";

const LABELS = [
  "Checking request",
  "Sending build context",
  "Waiting for AI response",
  "Validating generated code",
  "Updating preview",
];

function statuses(phase: GenerationPhase): StepStatus[] {
  if (phase === "preparing") {
    return ["running", "waiting", "waiting", "waiting", "waiting"];
  }
  if (phase === "generating") {
    return ["complete", "complete", "running", "waiting", "waiting"];
  }
  if (phase === "validating") {
    return ["complete", "complete", "complete", "running", "waiting"];
  }
  if (phase === "success") {
    return ["complete", "complete", "complete", "complete", "complete"];
  }
  if (phase === "error") {
    return ["complete", "complete", "error", "waiting", "waiting"];
  }
  return ["waiting", "waiting", "waiting", "waiting", "waiting"];
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "complete") return <Check size={12} />;
  if (status === "running") return <LoaderCircle className="spin" size={12} />;
  if (status === "error") return <X size={12} />;
  return <Circle size={8} />;
}

export function AgentSteps({ phase }: { phase: GenerationPhase }) {
  const state = statuses(phase);

  return (
    <div className="agent-card" aria-label="Agent execution timeline">
      <div className="agent-card-header">
        <span className="agent-pulse" />
        Forge agent
        <span className="agent-phase">{phase === "success" ? "Complete" : "Working"}</span>
      </div>
      <ol className="agent-steps">
        {LABELS.map((label, index) => (
          <li key={label} data-status={state[index]}>
            <span className="step-icon">
              <StepIcon status={state[index]} />
            </span>
            <span>{label}</span>
            <small>
              {state[index] === "complete"
                ? "Completed"
                : state[index] === "running"
                  ? "Running"
                  : state[index] === "error"
                    ? "Stopped"
                    : "Waiting"}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}
