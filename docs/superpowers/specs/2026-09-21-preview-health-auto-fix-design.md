# Preview Health and AI Auto-fix

## Objective

Add a visible generation-quality loop to Forge: every active preview reports whether it rendered successfully, whether its generated JavaScript raised runtime failures, and how much interactive surface it contains. When runtime issues exist, the user can send the verified diagnostics and current source through the existing refinement path with one click. The repair must preserve the current valid artifact until a replacement has passed the normal response schema and must create a restorable pre-repair revision.

The feature should make Forge feel agentic through an observable build-run-check-fix cycle without weakening the iframe sandbox, silently spending model credits, or pretending to test interactions it did not execute.

## Scope

The first version checks:

- the preview runtime started;
- the document reached a ready state;
- the body contains meaningful rendered content;
- the number of interactive controls and forms;
- uncaught `error` events;
- unhandled promise rejections.

The first version does not click controls, submit forms, judge visual quality, inspect application state, run accessibility audits, or claim that business behavior is correct. Repair is always user initiated.

## Architecture

### Preview-side diagnostics

`composePreviewDocument` accepts an optional opaque diagnostic session identifier. When present, the compatibility runtime installs diagnostics before the generated markup and application script execute.

The runtime:

1. collects bounded runtime issues from `error` and `unhandledrejection`;
2. sends an initial `checking` message;
3. waits for the document to become ready and for a short settle interval;
4. inspects rendered body content, interactive-control count, and form count;
5. sends a final `healthy` or `issues` result;
6. sends an updated `issues` result if a later runtime failure occurs.

Every message uses a dedicated channel, protocol version, and the supplied session identifier. Error messages, locations, and stacks are converted to strings, truncated, and capped to a small number of entries. The diagnostic runtime itself must not throw if an unusual rejection value or DOM state is encountered.

### Parent-side receiver

`PreviewPanel` owns a new diagnostic session for the currently rendered project revision. It resets health to `checking` when the project, its `updatedAt`, or the composed preview changes.

The parent accepts a message only when:

- `event.source` is the current iframe's `contentWindow`;
- the payload matches the preview-health protocol;
- the payload session identifier matches the current session;
- counts and issue fields satisfy strict bounds.

Messages from stale previews, other windows, or malformed payloads are ignored. The iframe keeps `sandbox="allow-scripts allow-forms"`; `allow-same-origin` is not added. The existing CSP remains unchanged.

### Health model

The client uses a discriminated health state:

- `checking`: the current preview has not produced a final report;
- `healthy`: meaningful content rendered and no runtime issue was captured;
- `issues`: one or more runtime issues occurred, or the rendered body is effectively empty;
- `unavailable`: no report arrived within a bounded timeout.

A final report includes:

- diagnostic session identifier;
- status;
- meaningful-content boolean;
- interactive-control count;
- form count;
- bounded issue list;
- report timestamp.

`unavailable` is honest uncertainty, not a failure. It does not enable AI repair unless a concrete issue exists.

## User Experience

A compact `Preview Health` surface appears directly below the Preview toolbar whenever a project is active.

- While checking: `Checking preview…`
- Healthy: `Preview healthy` plus rendered, control, and form facts.
- Issues: issue count, concise issue messages, and `Ask AI to fix`.
- Unavailable: `Preview check unavailable` with a `Run check again` action that remounts the iframe without changing project source.

The surface must fit desktop, tablet, and narrow layouts without covering the generated application. It uses semantic live status for state transitions, exposes full issue detail accessibly, and respects reduced motion.

`Ask AI to fix` is disabled while generation is active, code edits are dirty, or there is no concrete diagnostic issue.

## Repair Flow

The repair action reuses the existing `/api/generate` endpoint and the current generator state. Forge constructs a bounded repair instruction containing:

- a clear statement that the preview reported runtime failures;
- the normalized issue messages and source locations;
- the observed rendered/control/form facts;
- an instruction to preserve all useful current behavior;
- an instruction to return a complete corrected artifact.

The existing request also includes the current HTML, CSS, JavaScript, and recent conversation. No separate repair endpoint or second provider integration is introduced.

The visible conversation records a concise user-style audit message such as `Fix 2 detected preview runtime issues`; raw stacks are not expanded into the conversation. The provider still receives the bounded diagnostic detail.

On success:

- the current project is snapshotted before mutation;
- the returned artifact passes the existing client and server schemas;
- the project source and generation metadata update normally;
- the current revision source becomes `auto_fix`;
- the iframe remounts with a new diagnostic session;
- the new report determines whether the repair succeeded.

On provider, timeout, network, or schema failure, the existing project and preview remain unchanged and the existing retry UI remains available. Forge never automatically retries repair based on a failed health report, preventing loops and unexpected spend.

## Project and Version Model

`RevisionSource` adds `auto_fix`. Version History displays it as `AI auto-fix`.

The generation metadata kind remains `refinement`, because auto-fix is a refinement of an existing artifact. Revision source carries the more specific product meaning.

Project storage migration accepts projects created before the new revision source. Preview-health results are ephemeral and are not persisted: a restored or reloaded project runs a fresh check against its actual current source.

## Security and Privacy

- The iframe sandbox and CSP remain at least as restrictive as today.
- Parent message validation relies on both `event.source` and a per-render opaque session identifier.
- Diagnostic messages contain generated-preview data only and are bounded before leaving the iframe.
- Repair prompts never include API keys, environment values, parent-page storage, or unrelated browser information.
- Generated source continues to be treated as untrusted and runs only inside the sandbox.
- No new outbound connection is granted to generated applications.

## Failure Handling

- A malformed message is ignored without changing visible health.
- A stale-session message is ignored.
- Diagnostic-runtime serialization failures degrade to a generic bounded issue.
- A missing final report becomes `unavailable` after the timeout.
- A late concrete runtime error can move a healthy report to issues.
- A failed AI repair leaves the existing build and revision history untouched.
- A repair that generates another runtime failure is reported honestly and can be retried only by another explicit user action.

## Testing

Unit and component coverage must verify:

- protocol parsing accepts valid bounded reports and rejects malformed, oversized, stale, or foreign messages;
- the composed document installs listeners before generated JavaScript and reports ready, healthy, empty, error, and unhandled-rejection states;
- unusual thrown/rejected values cannot break diagnostics;
- `PreviewPanel` resets on a new project revision, times out honestly, and exposes retry;
- repair is disabled for checking, unavailable, clean health, generation, and dirty-code states as appropriate;
- the generated repair request contains normalized diagnostics and current source;
- successful repair snapshots the previous artifact and labels the new revision `auto_fix`;
- failed repair preserves the current artifact;
- existing forms, charts, storage compatibility, code editing, history, export, and refinement tests remain green.

Real-browser verification must:

1. apply code that throws a deterministic runtime error;
2. observe the issue in Preview Health;
3. trigger `Ask AI to fix`;
4. verify a new preview is rendered and checked;
5. verify the pre-repair artifact is available in Version History as the prior snapshot;
6. repeat desktop and 390px mobile layout checks;
7. confirm there are no parent-page console errors.

## Non-goals

- autonomous repair without user confirmation;
- synthetic clicking or form submission;
- visual-regression, accessibility, or business-logic scoring;
- persisted health reports;
- multi-agent orchestration;
- a new AI route or provider;
- relaxing iframe isolation.
