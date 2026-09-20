import { ArrowUpRight, Sparkles } from "lucide-react";

interface SuggestedActionsProps {
  suggestions: string[];
  disabled: boolean;
  onSelect: (suggestion: string) => void;
}

export function SuggestedActions({
  suggestions,
  disabled,
  onSelect,
}: SuggestedActionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <section className="suggestions" aria-label="Suggested next steps">
      <div className="section-label">
        <Sparkles size={13} /> Suggested next steps
      </div>
      <div className="suggestion-list">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion)}
          >
            <span>{suggestion}</span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}
