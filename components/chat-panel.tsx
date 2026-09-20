import {
  AlertTriangle,
  Check,
  Layers3,
  MousePointer2,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { AgentSteps } from "@/components/agent-steps";
import { SuggestedActions } from "@/components/suggested-actions";
import type { BuildSummary } from "@/lib/build-summary";
import type { GenerationPhase } from "@/hooks/use-generator";
import type { Project } from "@/types/project";

export interface ExamplePrompt {
  label: string;
  prompt: string;
  eyebrow: string;
}

interface ChatPanelProps {
  project: Project | null;
  pendingPrompt: string;
  phase: GenerationPhase;
  errorMessage?: string;
  buildSummary: BuildSummary | null;
  examples: ExamplePrompt[];
  disabled: boolean;
  onExample: (prompt: string) => void;
  onRetry: () => void;
  onSuggestion: (suggestion: string) => void;
}

function EmptyConversation({
  examples,
  onExample,
}: Pick<ChatPanelProps, "examples" | "onExample">) {
  return (
    <div className="welcome-state">
      <div className="welcome-kicker">
        <Sparkles size={13} /> AI app builder
      </div>
      <h1>Build something with AI</h1>
      <p>Describe your idea and watch it become a working web app.</p>
      <div className="example-grid">
        {examples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => onExample(example.prompt)}
            aria-label={`Use ${example.label} example`}
          >
            <span>{example.eyebrow}</span>
            <strong>{example.label}</strong>
            <p>{example.prompt}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function BuildSummaryCard({ summary }: { summary: BuildSummary }) {
  return (
    <section className="build-summary" aria-label="AI build summary">
      <div className="build-summary-title">
        <span className="success-mark">
          <Check size={12} />
        </span>
        <div>
          <strong>Build completed</strong>
          <span>
            {summary.persisted
              ? "Validated and saved locally"
              : "Built successfully · Local save needs attention"}
          </span>
        </div>
      </div>
      <div className="build-summary-grid">
        <span>
          <Layers3 size={13} /> {summary.components} components created
        </span>
        <span>
          <MousePointer2 size={13} /> {summary.interactions} interactions added
        </span>
        <span>
          <Smartphone size={13} />
          {summary.responsive ? "Responsive layout" : "Flexible layout"}
        </span>
        <span>
          {summary.persisted ? <Check size={13} /> : <AlertTriangle size={13} />}
          {summary.persisted
            ? "Persisted locally"
            : "Not saved — storage unavailable"}
        </span>
      </div>
    </section>
  );
}

export function ChatPanel({
  project,
  pendingPrompt,
  phase,
  errorMessage,
  buildSummary,
  examples,
  disabled,
  onExample,
  onRetry,
  onSuggestion,
}: ChatPanelProps) {
  const showTimeline = phase !== "idle";

  return (
    <div className="conversation-scroll">
      {!project && !pendingPrompt ? (
        <EmptyConversation examples={examples} onExample={onExample} />
      ) : (
        <div className="conversation">
          <div className="conversation-heading">
            <span>Build thread</span>
            <small>{project ? `${project.messages.length} messages` : "New build"}</small>
          </div>

          {project?.messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <span className="message-role">
                {message.role === "user" ? "You" : "Forge"}
              </span>
              <p>{message.content}</p>
              {message.changes?.length ? (
                <div className="change-list">
                  <span>Changes</span>
                  {message.changes.map((change) => (
                    <small key={change}>
                      <Check size={11} /> {change}
                    </small>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {pendingPrompt ? (
            <article className="message user pending-message">
              <span className="message-role">You</span>
              <p>{pendingPrompt}</p>
            </article>
          ) : null}

          {showTimeline ? <AgentSteps phase={phase} /> : null}

          {phase === "error" && errorMessage ? (
            <div className="error-card" role="alert">
              <span className="error-icon">
                <AlertTriangle size={15} />
              </span>
              <div>
                <strong>Build interrupted</strong>
                <p>{errorMessage}</p>
                <button type="button" onClick={onRetry} aria-label="Retry generation">
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            </div>
          ) : null}

          {project && buildSummary && phase !== "error" ? (
            <BuildSummaryCard summary={buildSummary} />
          ) : null}

          {project ? (
            <SuggestedActions
              suggestions={project.suggestions}
              disabled={disabled}
              onSelect={onSuggestion}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
