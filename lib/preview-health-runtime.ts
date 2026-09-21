import {
  PREVIEW_HEALTH_CHANNEL,
  PREVIEW_HEALTH_VERSION,
} from "../types/preview-health";

export function createPreviewHealthRuntime(sessionId: string): string {
  const configuration = JSON.stringify({
    channel: PREVIEW_HEALTH_CHANNEL,
    version: PREVIEW_HEALTH_VERSION,
    sessionId,
  });

  return `(() => {
  const configuration = ${configuration};

  try {
    const issues = [];
    const issueLimit = 5;

    const text = (value, limit) => {
      try {
        if (typeof value === "string") return value.slice(0, limit);
        if (value instanceof Error && typeof value.message === "string") {
          return value.message.slice(0, limit);
        }
        try {
          const serialized = JSON.stringify(value);
          if (typeof serialized === "string") return serialized.slice(0, limit);
        } catch (error) {}
        return String(value).slice(0, limit);
      } catch (error) {
        return "Unserializable runtime value";
      }
    };

    const nonNegativeInteger = (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : undefined;

    const optionalText = (value, limit) =>
      value === undefined || value === null ? "" : text(value, limit).trim();

    const addIssue = (value) => {
      try {
        if (issues.length >= issueLimit) return;
        const issue = { message: text(value.message || value.error || value.reason || value, 500).trim() || "Unknown runtime error" };
        const source = optionalText(value.source ?? value.filename, 500);
        const line = nonNegativeInteger(value.line ?? value.lineno);
        const column = nonNegativeInteger(value.column ?? value.colno);
        const stack = optionalText(value.stack ?? value.error?.stack, 1500);
        if (source) issue.source = source;
        if (line !== undefined) issue.line = line;
        if (column !== undefined) issue.column = column;
        if (stack) issue.stack = stack;
        issues.push(issue);
      } catch (error) {}
    };

    const measure = () => {
      try {
        const body = document.body;
        const bodyText = typeof body?.textContent === "string" ? body.textContent.trim() : "";
        const hasVisualElement = Boolean(body?.querySelector?.("canvas, svg, img, video"));
        return {
          hasMeaningfulContent: Boolean(bodyText || hasVisualElement),
          interactiveControls: document.querySelectorAll("button, input, select, textarea, a[href], [role=\\\"button\\\"]").length,
          forms: document.querySelectorAll("form").length,
        };
      } catch (error) {
        addIssue({ message: error });
        return { hasMeaningfulContent: false, interactiveControls: 0, forms: 0 };
      }
    };

    const report = (status, metrics) => {
      try {
        window.parent?.postMessage({
          channel: configuration.channel,
          version: configuration.version,
          sessionId: configuration.sessionId,
          status,
          hasMeaningfulContent: metrics.hasMeaningfulContent,
          interactiveControls: metrics.interactiveControls,
          forms: metrics.forms,
          issues: status === "issues" ? issues.slice(0, issueLimit) : [],
          reportedAt: Date.now(),
        }, "*");
      } catch (error) {}
    };

    const onError = (event) => addIssue(event || {});
    const onUnhandledRejection = (event) => addIssue(event || {});
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    report("checking", measure());

    const finalize = () => {
      try {
        const metrics = measure();
        if (!metrics.hasMeaningfulContent) {
          addIssue({ message: "Preview did not render meaningful content" });
        }
        report(issues.length > 0 ? "issues" : "healthy", metrics);
      } catch (error) {}
    };

    const afterReady = () => {
      try {
        window.setTimeout(finalize, 120);
      } catch (error) {
        finalize();
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", afterReady, { once: true });
    } else {
      afterReady();
    }
  } catch (error) {}
})();`;
}
