import type { GeneratedApp } from "@/types/ai";

export const GENERATED_APP_QUALITY_VIOLATION_CODES = [
  "HTML_DOCUMENT_WRAPPER",
  "HTML_SCRIPT_WRAPPER",
  "HTML_STYLE_WRAPPER",
  "HTML_INLINE_EVENT_HANDLER",
  "ACTIONABLE_HTML_REQUIRES_JAVASCRIPT",
  "ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER",
  "JAVASCRIPT_SYNTAX_ERROR",
  "JAVASCRIPT_NETWORK_API",
  "JAVASCRIPT_MODULE_IMPORT",
  "JAVASCRIPT_DOCUMENT_WRITE",
] as const;

export type GeneratedAppQualityViolationCode =
  (typeof GENERATED_APP_QUALITY_VIOLATION_CODES)[number];

export interface GeneratedAppQualityResult {
  violationCodes: GeneratedAppQualityViolationCode[];
  correctiveMessage: string;
}

function hasActionableInput(html: string) {
  return [...html.matchAll(/<input\b([^>]*)>/gi)].some((match) => {
    const attributes = match[1] ?? "";
    return !(
      /\btype\s*=\s*(?:"hidden"|'hidden'|hidden\b)/i.test(attributes) ||
      /(?:^|\s)hidden(?:\s|=|$)/i.test(attributes)
    );
  });
}

function hasActionableHtml(html: string) {
  return /<(?:button|form|select|textarea)\b/i.test(html) || hasActionableInput(html);
}

function hasJavaScriptSyntaxError(javascript: string) {
  try {
    new Function(javascript);
    return false;
  } catch {
    return true;
  }
}

export function validateGeneratedAppQuality(
  app: GeneratedApp,
): GeneratedAppQualityResult {
  const violationCodes: GeneratedAppQualityViolationCode[] = [];
  const { html, javascript } = app;
  const hasInteractiveContent = hasActionableHtml(html);

  if (/<\s*\/?\s*(?:html|head|body)\b/i.test(html)) {
    violationCodes.push("HTML_DOCUMENT_WRAPPER");
  }

  if (/<\s*\/?\s*script\b/i.test(html)) {
    violationCodes.push("HTML_SCRIPT_WRAPPER");
  }

  if (/<\s*\/?\s*style\b/i.test(html)) {
    violationCodes.push("HTML_STYLE_WRAPPER");
  }

  if (/<[^>]*\s+on[a-z][\w:-]*\s*=/i.test(html)) {
    violationCodes.push("HTML_INLINE_EVENT_HANDLER");
  }

  if (hasInteractiveContent && javascript.trim().length === 0) {
    violationCodes.push("ACTIONABLE_HTML_REQUIRES_JAVASCRIPT");
  }

  if (
    hasInteractiveContent &&
    javascript.trim().length > 0 &&
    !/\baddEventListener\s*\(/.test(javascript)
  ) {
    violationCodes.push("ACTIONABLE_HTML_REQUIRES_EVENT_LISTENER");
  }

  if (javascript.trim().length > 0 && hasJavaScriptSyntaxError(javascript)) {
    violationCodes.push("JAVASCRIPT_SYNTAX_ERROR");
  }

  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*(?:\.|\()/i.test(javascript)) {
    violationCodes.push("JAVASCRIPT_NETWORK_API");
  }

  if (/(?:^|[;\n])\s*import\s+(?:[\w*{]|["'])|\bimport\s*\(/m.test(javascript)) {
    violationCodes.push("JAVASCRIPT_MODULE_IMPORT");
  }

  if (/\bdocument\s*\.\s*write\s*\(/i.test(javascript)) {
    violationCodes.push("JAVASCRIPT_DOCUMENT_WRITE");
  }

  return {
    violationCodes,
    correctiveMessage:
      violationCodes.length === 0
        ? ""
        : `Correct the JSON artifact. Fix: ${violationCodes.join(", ")}. Return body-only HTML, safe syntactically valid browser JavaScript, and addEventListener wiring for actionable controls.`,
  };
}
