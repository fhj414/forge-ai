# Forge AI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable AI web app builder with reliable generation, sandboxed preview, iterative refinement, local project history, and complete UX states.

**Architecture:** Next.js serves a single client workbench and a server-only OpenAI-compatible generation route. Generated HTML/CSS/JavaScript is validated, stored locally as typed projects, and composed into an isolated iframe document.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind CSS 4, Lucide React, Zod, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-17-forge-ai-design.md`

## Global Constraints

- Generated applications contain body HTML, complete CSS, and native browser JavaScript only.
- The preview iframe uses `sandbox="allow-scripts"` and never `allow-same-origin`.
- API credentials remain server-side and come from `AI_API_KEY`, `AI_API_BASE`, and `AI_MODEL`.
- AI requests time out, retry once, strip Markdown fences, validate fields, and preserve the last valid preview on failure.
- Projects persist under `forge-ai-projects`; the active id persists under `forge-ai-current-project`.
- TypeScript strict mode remains enabled, and no production `any` types are introduced.

---

### Task 1: Foundation and generation contracts

**Files:**
- Create: `package.json`, configuration files, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `types/ai.ts`, `types/project.ts`, `lib/schemas.ts`, `lib/preview.ts`, `prompts/app-builder.ts`
- Test: `lib/schemas.test.ts`, `lib/preview.test.ts`

**Interfaces:**
- Produces: `GeneratedApp`, `GenerateRequest`, `Project`, `parseGeneratedApp(raw)`, `composePreviewDocument(code)`

- [x] Write tests proving fenced JSON is parsed, missing fields are rejected, closing script tags are neutralized, and valid code composes into a full document.
- [x] Run `npm test -- lib/schemas.test.ts lib/preview.test.ts` and confirm failures are caused by missing modules.
- [x] Add the typed contracts, strict parser, preview composer, system prompt, and minimum Next.js shell.
- [x] Re-run the focused tests and confirm they pass.

### Task 2: Server-side AI route

**Files:**
- Create: `lib/ai.ts`, `lib/api-response.ts`, `app/api/generate/route.ts`
- Test: `lib/ai.test.ts`, `app/api/generate/route.test.ts`

**Interfaces:**
- Consumes: `GenerateRequest`, `GeneratedApp`, `parseGeneratedApp`
- Produces: `generateApplication(input, config, fetcher)` and `POST(request)`

- [x] Write tests for missing configuration, current-code inclusion, one retry after a transient failure, timeout mapping, fenced output, and malformed model output.
- [x] Run the focused tests and confirm the expected missing-implementation failures.
- [x] Implement the provider-neutral fetch client and API route with structured error codes.
- [x] Re-run the focused tests and confirm they pass.

### Task 3: Project state and local persistence

**Files:**
- Create: `lib/storage.ts`, `lib/build-summary.ts`, `hooks/use-projects.ts`
- Test: `lib/storage.test.ts`, `lib/build-summary.test.ts`

**Interfaces:**
- Produces: `loadProjects`, `saveProjects`, `loadCurrentProjectId`, `saveCurrentProjectId`, `analyzeBuild`, and `useProjects`

- [x] Write tests for unavailable/corrupt storage, round-trip persistence, current-id persistence, and deterministic component/interaction counts.
- [x] Run focused tests and confirm missing behavior fails.
- [x] Implement safe storage adapters and build analysis, then integrate project create/update/restore/delete/reset behavior in the hook.
- [x] Re-run focused tests and confirm they pass.

### Task 4: End-to-end builder workspace

**Files:**
- Create: `hooks/use-generator.ts`
- Create: `components/app-header.tsx`, `components/chat-panel.tsx`, `components/prompt-input.tsx`, `components/agent-steps.tsx`, `components/preview-panel.tsx`, `components/code-viewer.tsx`, `components/project-history.tsx`, `components/suggested-actions.tsx`, `components/builder-workspace.tsx`
- Test: `components/builder-workspace.test.tsx`

**Interfaces:**
- Consumes: `/api/generate`, `useProjects`, `composePreviewDocument`, `analyzeBuild`
- Produces: complete prompt → timeline → preview → refine → persist interaction

- [x] Write interaction tests for example selection, initial generation, current-code refinement, preview/code/viewport switching, suggestions, error retry, history restore/delete, and new-project reset.
- [x] Run the component test and confirm the workspace is absent.
- [x] Implement the generator state machine and focused UI components.
- [x] Re-run the component test and confirm all interaction cases pass.

### Task 5: Product polish and documentation

**Files:**
- Modify: `app/globals.css`, all UI components
- Create: `README.md`, `SUBMISSION.md`

**Interfaces:**
- Produces: responsive professional UI, setup/deployment documentation, architecture and trade-off narrative

- [x] Run `npm test` to establish the behavior baseline before styling.
- [x] Apply responsive layout, visible focus states, reduced-motion support, refined loading/error/empty states, and accessible labels.
- [x] Document local setup, environment variables, Vercel deployment, architecture Mermaid diagram, engineering decisions, limitations, and prioritized future work.
- [x] Run `npm test`, `npm run lint`, and `npm run build`; fix every regression.
- [x] Run browser QA for both supplied acceptance prompts, refresh persistence, new project/history restore, API error/retry, and mobile layout.
