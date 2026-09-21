# Implementation Summary

## What I built

Forge AI is an end-to-end AI app builder prototype rather than a static Atoms clone. It accepts natural-language product requests, exposes a real generation lifecycle, validates a structured AI response, renders the generated application in an isolated preview, persists projects, and supports conversational refinement using the existing source.

The finished surface includes responsive Preview and Code views, desktop/tablet/mobile switching, local project history, recoverable failures, one-click suggested improvements, and a compact Build Summary that explains what Forge created.

## Core User Flow

1. Start from an example or write a custom prompt.
2. Follow Checking request → Sending build context → Waiting for AI response → Validating generated code → Updating preview.
3. Use the rendered application inside the live preview; Preview Health automatically checks rendered content, interaction-surface facts, and bounded runtime failures.
4. When a concrete runtime issue appears, choose `Ask AI to fix` to send the current source and normalized diagnostics through the existing refinement flow.
5. Forge snapshots the pre-repair artifact, validates the returned source, renders it, and runs a fresh health check. The new current source is labeled `AI auto-fix` in Version History.
6. Inspect or copy its HTML, CSS, and JavaScript.
7. Request a change or choose a suggested next step.
8. Forge submits the current source with the new instruction and updates the same project.
9. Refresh, start a new project, or restore an earlier project from History.

## Engineering Decisions

- **Next.js App Router:** one Vercel-compatible deployment contains both the product UI and protected server API.
- **Constrained generation contract:** the model returns a typed HTML/CSS/JavaScript payload with changes and suggestions.
- **Defense at the boundary:** Markdown fence cleanup, JSON extraction, Zod validation, timeout, retry, and structured error codes protect the client from provider variability.
- **Sandboxed preview:** generated code executes with `allow-scripts` but without same-origin or outbound network access.
- **Preview Health, not synthetic testing:** the preview automatically observes rendered content, counts controls/forms, and reports bounded uncaught errors or unhandled rejections. It does not click controls, submit forms, score visuals, audit accessibility, or verify business behavior.
- **Explicit repair with preserved failure state:** only the user can request a repair. The request is bounded and uses the existing server route; a failed response leaves the current preview and revisions untouched, and Forge never self-retries a health report or spends model credits automatically.
- **Unchanged isolation boundary:** Preview Health keeps the existing sandbox and CSP policy intact. Messages must come from the active iframe and match its opaque per-render session id; no parent-page data, environment values, or new outbound capability enters repair.
- **Local-first adapter:** browser persistence is sufficient for a demo while keeping the storage boundary replaceable; quota and availability failures are surfaced in the UI.
- **Truthful progress:** execution steps correspond to client validation, active request, response validation, and committed preview state.

## Trade-offs

I deliberately did not build a WebContainer, npm runtime, or full React project generator. Under a 6–8 hour constraint, those choices would consume time in dependency installation, compilation, and generated-code recovery while reducing demo reliability.

Instead, I prioritized the complete product loop:

```text
Generate → Validate → Preview → Check → Repair → Re-check
```

This produces a more convincing AI-native product than a larger feature list with an unreliable core path.

## Current Limitations

- Persistence is limited to one browser profile.
- Generated apps use one document and native browser APIs.
- The provider response is not streamed.
- The generated application cannot install dependencies or access the host application.
- A production deployment still needs provider credentials configured by the deployer.
- Preview Health is intentionally a runtime/render signal, not a substitute for interaction, visual, accessibility, or business-logic testing.

## What I would build next

The first follow-up would be streamed structured build events plus stronger source validation. Next I would add project version history and a cloud storage adapter. Once those foundations are stable, I would introduce React multi-file generation in a Sandpack/WebContainer runtime, then generated-app deployment, GitHub sync, and visual editing.
