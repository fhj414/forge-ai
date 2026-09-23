# Preview Reliability Rescue Implementation Plan

**Goal:** Prevent generated applications with obviously missing interaction behavior from being accepted as successful, and replace the misleading Preview Health claim with bounded runtime and interaction-wiring evidence.

**Approved design:** Keep the fast configured model for the primary attempt. Add a deterministic artifact-quality floor and at most one corrective model attempt, add non-destructive interaction wiring diagnostics in the preview, and use honest UI copy. Do not synthesize clicks or claim arbitrary business correctness.

## Global Constraints

- Follow test-driven development: add a focused failing test before each behavior change and record the red/green evidence.
- Keep the configured fast model as the normal first attempt; do not switch the default model.
- A generated artifact with advertised form/button behavior must not be accepted when JavaScript is empty or has no event-listener wiring.
- Generated JavaScript must be syntax-checked without executing it.
- Reject full-document/script/style wrappers in the generated HTML and reject inline HTML event handlers, network APIs, module imports, and `document.write` in generated JavaScript.
- Invalid model output may receive at most one compact corrective retry and all attempts share the existing request deadline.
- Never run synthetic clicks/submits in Preview Health. The preview may observe listener registration only.
- Preview wording must distinguish runtime success from interaction-wiring evidence and must never imply business correctness.
- Directly wired actionable controls/forms may be reported as complete; detected missing direct wiring is an issue; delegated/indirect wiring is `unknown` and requires manual verification rather than being called complete.
- Static previews with no advertised actions may pass the runtime check with interaction coverage `none`.
- Preserve current source/session isolation, late-error reporting, repair flow, project persistence, and standalone preview behavior.

## Task 1: Add a server-side generated-artifact quality gate and corrective retry

Create a focused quality validator for parsed `GeneratedApp` values and integrate it into generation before the route returns success.

Requirements:

- Detect actionable HTML (`button`, `form`, `select`, `textarea`, and non-hidden `input`). If present, require non-empty JavaScript containing event-listener wiring.
- Syntax-check JavaScript without executing it.
- Reject HTML document/script/style wrappers and inline `on*` handlers.
- Reject generated JavaScript that uses network APIs, module imports, or `document.write`.
- Return bounded, machine-readable violation codes plus a concise corrective message.
- Treat parse/schema/quality failures as invalid model output eligible for one corrected second attempt. The corrective attempt must include only bounded violation guidance, use the configured model, and share the existing abort deadline.
- Never perform more than two provider requests total. Preserve transient retry behavior and public error mapping.
- Add focused validator, AI client, and route tests covering rejection, correction success, correction exhaustion, and acceptance of static non-interactive content.

## Task 2: Add interaction-wiring evidence to Preview Health

Upgrade the preview-health protocol and injected runtime to observe direct listener registration without triggering user actions.

Requirements:

- Bump the preview-health protocol version and add bounded interaction metrics and coverage: `none`, `complete`, `incomplete`, or `unknown`.
- Add exact report fields `advertisedActions`, `wiredActions`, `advertisedForms`, `wiredForms`, `delegatedActionListeners`, and `interactionCoverage`; bound all counts to 10,000 and reject impossible count/coverage combinations in the parent parser.
- Patch listener registration only after Forge's own compatibility/runtime listeners are installed so internal listeners are not credited to generated code.
- Observe direct `click`, `submit`, `input`, `change`, and keyboard activation handlers registered by generated code.
- Treat forms as handled by a direct submit listener. Treat actionable buttons/roles outside a handled form, and non-submit buttons within forms, as separately advertised actions. Ignore native links.
- Report complete only when every advertised action/form has matching direct wiring. Report incomplete with a concrete issue when direct wiring is missing and no delegation signal exists. Report unknown when delegated/indirect action listeners prevent a sound direct-coverage conclusion.
- Preserve `interactiveControls` and `forms` as discovery counts for compatibility. `complete` requires at least one advertised action/form and full direct coverage; `none` requires no advertised action/form and no delegated action signal; `incomplete` requires missing direct coverage with no delegation signal; `unknown` covers missing direct coverage when delegation was observed.
- Preserve empty-content errors, uncaught error/rejection capture, late issue updates, report bounds, and source/session validation.
- Add failing-first runtime and protocol tests for fully wired, partially wired, wrong-selector/guarded listener, form wiring, delegation unknown, static none, and late runtime errors.

## Task 3: Make Preview and build-summary UI claims honest

Update presentation and repair behavior for the upgraded protocol.

Requirements:

- Replace `Preview healthy` with `Runtime check passed`.
- Show interaction wiring separately using exact copy: `Interaction wiring: {wired}/{advertised} detected` for complete/incomplete counts, `Interaction wiring: Manual verification needed` for unknown, and `Interaction wiring: No app actions detected` for none.
- Rename fact labels to `Controls found` and `Forms found` so structural discovery is not confused with working behavior.
- Keep concrete incomplete wiring eligible for `Ask AI to fix`; do not offer repair solely because coverage is unknown.
- Rename markup-derived build summary wording to the exact copy `{count} interactive elements found`.
- Reset health/coverage on retry, revision changes, and iframe reload exactly as the current status resets.
- Add focused component/build-summary tests for every state and integration tests that prevent a healthy headline from appearing for inert controls.

## Task 4: Integration verification and delivery

- Run the full unit suite, lint, and production build.
- Exercise the deployed-style app in a real browser: generate or load one wired fixture and one inert fixture, verify correct runtime/interaction states, and verify a working control changes the preview.
- Perform a whole-branch code review and resolve all load-bearing findings.
- Update `README.md` and the candidate-facing `SUBMISSION.md` only where claims are supported by verification: document the artifact-quality gate and one bounded corrective retry; describe `complete`, `incomplete`, `unknown`, and `none` interaction evidence; state that listener wiring is not business-semantic proof; update the test count to 123; record the wired/inert/delegated browser QA; and retain provider latency/timeouts as an explicit external limitation.
- Remove roadmap claims that syntax/danger checks are still unimplemented, replacing them with the next measurable reliability priorities (provider telemetry, model outcome comparison, and declarative smoke checks).
- Commit this approved implementation plan with the delivery documentation. Do not commit the ignored SDD ledger/review artifacts.
- Commit the reviewed changes and prepare the production deployment/push authorized by the user.
