import { ArrowUp, LoaderCircle } from "lucide-react";
import type { KeyboardEvent } from "react";

interface PromptInputProps {
  value: string;
  isRefinement: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function PromptInput({
  value,
  isRefinement,
  disabled,
  onChange,
  onSubmit,
}: PromptInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="composer-shell">
      <textarea
        aria-label="Describe your app"
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isRefinement
            ? "Describe what you want to change…"
            : "Describe the app you want to build…"
        }
      />
      <div className="composer-footer">
        <span>Enter to send · Shift + Enter for a new line</span>
        <button
          type="button"
          className="generate-button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          aria-label={isRefinement ? "Refine app" : "Generate app"}
        >
          {disabled ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ArrowUp size={15} strokeWidth={2.5} />
          )}
          {isRefinement ? "Refine" : "Generate"}
        </button>
      </div>
    </div>
  );
}
