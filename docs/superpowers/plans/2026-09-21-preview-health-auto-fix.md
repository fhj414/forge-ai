# Preview Health and AI Auto-fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect generated-preview runtime failures inside the existing sandbox and let the user repair concrete issues through the existing AI refinement flow with one click.

**Architecture:** Inject a bounded diagnostics runtime into each composed preview and send versioned reports to `PreviewPanel` with `postMessage`. Validate sender, session, and payload in the parent; render a focused health surface; and route explicit repair through the current generator while snapshotting the previous artifact as an `auto_fix` revision.

**Tech Stack:** Next.js App Router, React 19, strict TypeScript, Zod, sandboxed iframe `srcDoc`, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-21-preview-health-auto-fix-design.md`

## Global Constraints

- Keep the iframe sandbox exactly `allow-scripts allow-forms`; do not add `allow-same-origin`.
- Keep the current CSP and do not grant generated applications outbound network access.
- Repair is initiated only by an explicit user click; never start an automatic model request.
- Do not simulate clicks, submit forms, or claim business-logic correctness.
- Accept reports only from the current iframe and current opaque diagnostic session.
- Cap reports at 5 issues, each message at 500 characters and each stack at 1,500 characters.
- Preview-health state is ephemeral and is not persisted.
- Reuse `/api/generate`, current source, conversation context, schema validation, error handling, and the ten-revision cap.
- A failed repair must preserve the current artifact.
- Do not add dependencies.

---

### Task 1: Define the preview-health protocol and repair prompt

**Files:**
- Create: `types/preview-health.ts`
- Create: `lib/preview-health.ts`
- Test: `lib/preview-health.test.ts`

**Interfaces:**
- Consumes: Zod and the approved health-report bounds.
- Produces:
  - `PREVIEW_HEALTH_CHANNEL: "forge:preview-health"`
  - `PREVIEW_HEALTH_VERSION: 1`
  - `PreviewHealthIssue`
  - `PreviewHealthReport`
  - `PreviewHealthState`
  - `parsePreviewHealthMessage(input: unknown, expectedSessionId: string): PreviewHealthReport | null`
  - `buildPreviewRepairPrompt(report: PreviewHealthReport): { requestPrompt: string; displayPrompt: string }`

- [ ] **Step 1: Write failing protocol and prompt tests**

Create tests that exercise the public interface:

```ts
const report = {
  channel: PREVIEW_HEALTH_CHANNEL,
  version: PREVIEW_HEALTH_VERSION,
  sessionId: "preview-session",
  status: "issues",
  hasMeaningfulContent: true,
  interactiveControls: 3,
  forms: 1,
  issues: [{
    message: "Chart is not a constructor",
    source: "about:srcdoc",
    line: 42,
    column: 7,
    stack: "TypeError: Chart is not a constructor",
  }],
  reportedAt: 1_700_000_000_000,
};

expect(parsePreviewHealthMessage(report, "preview-session")).toEqual(report);
expect(parsePreviewHealthMessage(report, "stale-session")).toBeNull();
expect(parsePreviewHealthMessage({ ...report, channel: "other" }, "preview-session")).toBeNull();
expect(parsePreviewHealthMessage({ ...report, issues: Array(6).fill(report.issues[0]) }, "preview-session")).toBeNull();
```

Also verify overlong strings, negative counts, unknown statuses, and malformed inputs return `null`. Verify `buildPreviewRepairPrompt` includes normalized messages and locations, rendered/control/form facts, preservation instructions, and the concise display text `Fix 1 detected preview runtime issue`, while excluding the full stack from `displayPrompt`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- --run lib/preview-health.test.ts
```

Expected: FAIL because the protocol modules do not exist.

- [ ] **Step 3: Add exact protocol types**

Define:

```ts
export const PREVIEW_HEALTH_CHANNEL = "forge:preview-health" as const;
export const PREVIEW_HEALTH_VERSION = 1 as const;

export interface PreviewHealthIssue {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface PreviewHealthReport {
  channel: typeof PREVIEW_HEALTH_CHANNEL;
  version: typeof PREVIEW_HEALTH_VERSION;
  sessionId: string;
  status: "checking" | "healthy" | "issues";
  hasMeaningfulContent: boolean;
  interactiveControls: number;
  forms: number;
  issues: PreviewHealthIssue[];
  reportedAt: number;
}

export type PreviewHealthState =
  | PreviewHealthReport
  | { status: "unavailable"; sessionId: string };
```

- [ ] **Step 4: Implement strict parsing and bounded repair-prompt composition**

Use a strict Zod object with:

```ts
const issueSchema = z.object({
  message: z.string().trim().min(1).max(500),
  source: z.string().max(500).optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  stack: z.string().max(1_500).optional(),
}).strict();
```

Bound `sessionId` to 128 characters, counts to 10,000, issues to 5, and require zero issues for `checking` and `healthy`. Return `null` rather than throwing. Build the provider prompt from messages and locations only, cap the final prompt to 4,000 characters, and include: preserve useful behavior, change only what is needed, return a complete artifact, and avoid hiding errors.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- --run lib/preview-health.test.ts
git diff --check
```

Expected: all focused tests PASS and diff check is clean.

Commit:

```bash
git add types/preview-health.ts lib/preview-health.ts lib/preview-health.test.ts
git commit -m "feat: define preview health protocol"
```

---

### Task 2: Instrument the sandboxed preview runtime

**Files:**
- Create: `lib/preview-health-runtime.ts`
- Modify: `lib/preview.ts`
- Modify: `lib/preview.test.ts`
- Test: `lib/preview-health-runtime.test.ts`

**Interfaces:**
- Consumes: `PREVIEW_HEALTH_CHANNEL`, `PREVIEW_HEALTH_VERSION`, and a caller-supplied diagnostic session identifier.
- Produces:
  - `createPreviewHealthRuntime(sessionId: string): string`
  - `PreviewDocumentOptions { diagnosticSessionId?: string }`
  - `composePreviewDocument(code: AppCode, options?: PreviewDocumentOptions): string`

- [ ] **Step 1: Write failing runtime tests**

Test the generated runtime in a VM-style browser context. Capture `window.parent.postMessage` calls and registered listeners. Cover:

```ts
expect(messages[0]).toMatchObject({
  channel: "forge:preview-health",
  version: 1,
  sessionId: "health-1",
  status: "checking",
});
```

Then trigger ready/settle behavior and verify a meaningful document with three controls and one form produces `healthy`. Trigger registered `error` and `unhandledrejection` listeners and verify bounded `issues` reports. Use thrown objects, strings, and circular values to prove serialization cannot crash. Verify empty text with no visual element produces an issue.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
npm test -- --run lib/preview-health-runtime.test.ts lib/preview.test.ts
```

Expected: FAIL because diagnostics are not injected.

- [ ] **Step 3: Generate a self-contained diagnostics runtime**

`createPreviewHealthRuntime` must return classic JavaScript with no imports. Embed channel, version, and session with `JSON.stringify`. Install listeners before generated code. Use:

```js
window.addEventListener("error", onError);
window.addEventListener("unhandledrejection", onUnhandledRejection);
```

Meaningful content is true when trimmed body text is non-empty or the body contains `canvas, svg, img, video`. Count `button, input, select, textarea, a[href], [role="button"]` and `form`. Report after DOM readiness plus a 120 ms settle delay, cap issues to 5, normalize every field, and wrap diagnostics internals in defensive `try/catch`.

- [ ] **Step 4: Inject diagnostics without weakening preview composition**

Extend `composePreviewDocument` with optional `PreviewDocumentOptions`. Place the diagnostics script before generated markup and generated JavaScript, alongside but separate from the existing compatibility runtime. With no `diagnosticSessionId`, keep exported standalone HTML behavior unchanged and omit parent reporting.

Keep the CSP and:

```html
sandbox="allow-scripts allow-forms"
```

unchanged.

- [ ] **Step 5: Run preview regression tests and commit**

Run:

```bash
npm test -- --run lib/preview-health-runtime.test.ts lib/preview.test.ts lib/preview-form.test.ts lib/export-project.test.ts
git diff --check
```

Expected: diagnostics tests and all existing preview/export tests PASS.

Commit:

```bash
git add lib/preview-health-runtime.ts lib/preview-health-runtime.test.ts lib/preview.ts lib/preview.test.ts
git commit -m "feat: report sandbox preview health"
```

---

### Task 3: Receive reports and render Preview Health

**Files:**
- Create: `components/preview-health.tsx`
- Create: `components/preview-health.test.tsx`
- Modify: `components/preview-panel.tsx`
- Modify: `components/preview-panel.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes:
  - `parsePreviewHealthMessage(input, expectedSessionId)`
  - `PreviewHealthReport`
  - `composePreviewDocument(code, { diagnosticSessionId })`
- Produces:
  - `PreviewHealth` presentational component
  - `PreviewPanel.onRepair?: (report: PreviewHealthReport) => void`
  - `PreviewPanel.repairDisabled?: boolean`

- [ ] **Step 1: Write failing health-surface tests**

Render `PreviewHealth` for:

- checking: `Checking preview…`;
- healthy: `Preview healthy`, content/control/form facts, and no repair button;
- issues: bounded messages and enabled `Ask AI to fix`;
- unavailable: `Preview check unavailable` and `Run check again`;
- disabled issues: repair button disabled.

Verify callbacks fire exactly once.

- [ ] **Step 2: Write failing PreviewPanel message-boundary tests**

Render an active project, capture the iframe, and dispatch `MessageEvent` instances. Verify:

- valid current-source/current-session report updates the UI;
- foreign `source` is ignored;
- wrong session is ignored;
- malformed payload is ignored;
- changing `project.updatedAt` returns to checking with a new session;
- no final result within 3 seconds becomes unavailable;
- `Run check again` remounts the iframe with a new session.

Use fake timers only for the timeout/settle boundary and restore real timers after each test.

- [ ] **Step 3: Run component tests and confirm RED**

Run:

```bash
npm test -- --run components/preview-health.test.tsx components/preview-panel.test.tsx
```

Expected: FAIL because the component and receiver props do not exist.

- [ ] **Step 4: Implement the health component**

Use semantic output:

```tsx
<section className="preview-health" aria-label="Preview health" aria-live="polite">
  ...
</section>
```

Show no more than the already bounded five messages. Include rendered, controls, and forms facts. Do not claim interactivity was executed.

- [ ] **Step 5: Implement the receiver and session lifecycle**

Use an iframe ref and `createId("preview-health")`. Register one window `message` listener. Before parsing, require:

```ts
if (event.source !== iframeRef.current?.contentWindow) return;
```

Parse with the current session. Reset state whenever project id, `updatedAt`, or a retry counter changes. Start a 3,000 ms timeout that changes only a still-checking state to unavailable. Compose `srcDoc` with the session and pass concrete issue reports to `onRepair`.

- [ ] **Step 6: Style desktop and mobile states**

Add compact success, warning, checking, and unavailable styles below the toolbar. Preserve the preview height, allow long messages to wrap, keep actions reachable at 390 px, and add no animation that violates the existing reduced-motion rule.

- [ ] **Step 7: Run component and accessibility regressions, then commit**

Run:

```bash
npm test -- --run components/preview-health.test.tsx components/preview-panel.test.tsx components/builder-workspace.test.tsx
npm run lint
git diff --check
```

Expected: focused tests, lint, and diff check PASS.

Commit:

```bash
git add components/preview-health.tsx components/preview-health.test.tsx components/preview-panel.tsx components/preview-panel.test.tsx app/globals.css
git commit -m "feat: show generated preview health"
```

---

### Task 4: Connect one-click AI repair and version history

**Files:**
- Modify: `types/project.ts`
- Modify: `lib/storage.ts`
- Modify: `lib/storage.test.ts`
- Modify: `hooks/use-projects.ts`
- Modify: `hooks/use-projects.test.tsx`
- Modify: `components/builder-workspace.tsx`
- Modify: `components/builder-workspace.test.tsx`
- Modify: `components/version-history.tsx`

**Interfaces:**
- Consumes:
  - `PreviewHealthReport`
  - `buildPreviewRepairPrompt(report)`
  - existing `useGenerator.generate(GenerateRequest)`
- Produces:
  - `RevisionSource = "initial" | "refinement" | "manual" | "restore" | "auto_fix"`
  - `commitGeneration(result: GeneratedBuild, prompt: string, source?: "refinement" | "auto_fix"): void`
  - Version label `auto_fix: "AI auto-fix"`

- [ ] **Step 1: Write failing storage and hook tests**

Extend storage coverage with a project/current revision and historical revision whose source is `auto_fix`; verify round-trip succeeds.

Extend the hook harness with:

```tsx
projects.commitGeneration(fixedBuild, "Fix detected preview issue", "auto_fix");
```

Verify current `revisionSource` is `auto_fix`, the immediately previous artifact is first in `revisions`, messages include the concise repair audit entry, and the ten-version cap still applies.

- [ ] **Step 2: Write failing workspace repair-flow tests**

Render a restored project, dispatch a valid current iframe issue report, click `Ask AI to fix`, and assert the request:

```ts
expect(request.prompt).toContain("Chart is not a constructor");
expect(request.currentCode).toEqual({
  html: restoredProject.html,
  css: restoredProject.css,
  javascript: restoredProject.javascript,
});
```

Resolve a valid generated response and verify:

- the visible pending/user message is concise and excludes raw stack text;
- the fixed artifact replaces the current preview;
- Version History shows the prior snapshot;
- the current persisted revision source is `auto_fix`;
- the repair button is disabled during generation and when code is dirty.

Add a provider-error case and verify current `srcDoc` and revisions remain unchanged.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
npm test -- --run lib/storage.test.ts hooks/use-projects.test.tsx components/builder-workspace.test.tsx
```

Expected: FAIL because `auto_fix` and repair callbacks are not implemented.

- [ ] **Step 4: Extend the version model and storage schema**

Add `auto_fix` to `RevisionSource`, the storage Zod enum, and `SOURCE_LABELS`. Existing projects need no transform because the addition is backward compatible.

- [ ] **Step 5: Make generation commits source-aware**

Change the hook signature to:

```ts
commitGeneration(
  result: GeneratedBuild,
  prompt: string,
  source: "refinement" | "auto_fix" = "refinement",
): void
```

For a new project, continue using `initial`. For an existing project, set `revisionSource` to the provided source after snapshotting the current artifact.

- [ ] **Step 6: Separate provider and visible prompts in the workspace**

Refactor the internal submission helper to accept:

```ts
interface GenerationIntent {
  requestPrompt: string;
  displayPrompt?: string;
  revisionSource?: "refinement" | "auto_fix";
}
```

Use `requestPrompt` in `generator.generate`, `displayPrompt ?? requestPrompt` for `pendingPrompt` and the persisted conversation message, and pass `revisionSource` to `commitGeneration`.

Normal user prompts and suggested actions keep existing behavior. The repair callback calls `buildPreviewRepairPrompt`, refuses checking/healthy/unavailable reports, and passes the current report to the new intent.

- [ ] **Step 7: Connect PreviewPanel repair state**

Pass:

```tsx
repairDisabled={generator.isGenerating || hasUnsavedCode}
onRepair={(report) => void repairPreview(report)}
```

Keep new project, project history, version history, code Apply, and normal refinement locked exactly as they are during active generation or dirty code.

- [ ] **Step 8: Run integration tests and commit**

Run:

```bash
npm test -- --run lib/preview-health.test.ts lib/storage.test.ts hooks/use-projects.test.tsx components/builder-workspace.test.tsx components/preview-panel.test.tsx
npm run lint
git diff --check
```

Expected: repair integration, persistence, revision, and existing workspace tests PASS.

Commit:

```bash
git add types/project.ts lib/storage.ts lib/storage.test.ts hooks/use-projects.ts hooks/use-projects.test.tsx components/builder-workspace.tsx components/builder-workspace.test.tsx components/version-history.tsx
git commit -m "feat: repair preview issues with AI"
```

---

### Task 5: Document, verify, and browser-test the complete loop

**Files:**
- Modify: `README.md`
- Modify: `SUBMISSION.md`
- Modify only if verification exposes a defect: files already listed in Tasks 1–4

**Interfaces:**
- Consumes: the complete preview-health and AI repair flow.
- Produces: accurate delivery documentation and final verification evidence.

- [ ] **Step 1: Update product documentation**

Document:

- automatic render/runtime checks;
- the exact non-invasive scope;
- explicit one-click repair;
- `AI auto-fix` revision history;
- unchanged sandbox/CSP boundaries;
- failure preservation and no automatic spend.

Update the architecture flow to:

```text
Generate → Validate → Preview → Check → Repair → Re-check
```

Do not claim synthetic interaction testing, visual QA, or business-logic verification.

- [ ] **Step 2: Run the complete automated gate**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Run real-browser acceptance**

Against `http://localhost:3000`:

1. restore or generate a project;
2. use Code Apply to set JavaScript to `throw new Error("Forge health smoke test")`;
3. verify Preview Health shows the exact issue without a parent-page error;
4. click `Ask AI to fix`;
5. verify the request timeline completes and a fresh health check runs;
6. verify the current preview no longer reports the injected error;
7. verify Version History exposes the broken pre-repair artifact and labels the new current source `AI auto-fix`;
8. reload and verify project persistence;
9. inspect desktop and 390 px mobile layouts;
10. re-run Task Manager add/complete/delete and Expense Tracker add-expense behavior.

- [ ] **Step 4: Review the complete branch**

Review the full spec-to-implementation diff for correctness, sandbox regression, spoofed-message handling, unbounded prompt/error data, stale reports, unexpected model calls, revision loss, responsive layout, and missing tests. Resolve every Critical or Important finding and re-run the complete automated gate.

- [ ] **Step 5: Commit documentation and verification fixes**

```bash
git add README.md SUBMISSION.md
git commit -m "docs: explain preview health repair loop"
```

Any source or test correction found during verification must be committed with its exact paths before this documentation commit. Do not create an empty commit if the documentation was already included in an earlier task.
