# Delivery Confidence Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy generation metadata, capped project revision history with restore, and standalone HTML download.

**Architecture:** Extend the server response with separately validated metadata, persist that metadata on projects and revision snapshots, and keep all project mutations inside `useProjects`. Reuse the preview document composer for a safe single-file export and expose history/export through focused UI controls.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Vitest, Testing Library, browser Blob/download APIs

**Spec:** `docs/superpowers/specs/2026-09-21-delivery-confidence.md`

## Global Constraints

- Existing saved projects without metadata or versions must continue to load.
- Keep the iframe sandbox, CSP, form, storage, and Chart compatibility behavior unchanged.
- Keep at most ten prior revisions per project after every mutation.
- Never expose API keys or server-only environment configuration in client responses, persistence, history, or downloads.
- Add no runtime dependency.
- Follow red-green-refactor and commit each task independently.

---

### Task 1: Record and display real generation metadata

**Files:**
- Modify: `types/ai.ts`
- Modify: `types/project.ts`
- Modify: `lib/schemas.ts`
- Modify: `lib/client-api.ts`
- Modify: `app/api/generate/route.ts`
- Modify: `hooks/use-generator.ts`
- Modify: `hooks/use-projects.ts`
- Modify: `lib/storage.ts`
- Modify: `lib/build-summary.ts`
- Modify: `components/chat-panel.tsx`
- Modify tests adjacent to those files

**Interfaces:**
- Produces: `GenerationMetadata`, `GeneratedBuild`, `parseGeneratedBuild`, optional `Project.generationMetadata`
- Metadata fields: `model`, `durationMs`, `kind`, `codeLines`, `codeBytes`, `schemaValidated`

- [ ] Write failing schema, route, client, storage, and UI tests with literal metadata values.
- [ ] Verify the focused tests fail because metadata is absent or discarded.
- [ ] Add the trusted metadata types and a schema that validates server responses separately from provider output.
- [ ] Measure the complete successful generation in the route, calculate UTF-8 bytes and source lines, and attach metadata only after validation.
- [ ] Persist metadata with project commits and surface it in the Build Summary.
- [ ] Run focused tests, then commit as `feat: show real generation metadata`.

### Task 2: Add capped version history and one-click restore

**Files:**
- Modify: `types/project.ts`
- Modify: `lib/storage.ts`
- Modify: `hooks/use-projects.ts`
- Create: `components/version-history.tsx`
- Modify: `components/preview-panel.tsx`
- Modify: `components/builder-workspace.tsx`
- Modify: `app/globals.css`
- Modify tests adjacent to those files

**Interfaces:**
- Produces: `RevisionSource`, `ProjectRevision`, revision fields on `Project`, and `restoreProjectVersion(versionId: string)`
- Consumes: optional `Project.generationMetadata` from Task 1

- [ ] Write failing tests for AI/manual pre-mutation snapshots, migration defaults, ten-version cap, drawer labels, and Restore preserving the replaced current state.
- [ ] Verify focused tests fail because versions and restore do not exist.
- [ ] Add revision types and backward-compatible storage defaults.
- [ ] Centralize snapshot creation and capping inside `useProjects`; snapshot before refinement, manual Apply, and Restore.
- [ ] Add the active-project Version history drawer and disable version-changing actions while generation is active or code is dirty.
- [ ] Run focused tests, then commit as `feat: add project version history`.

### Task 3: Download a standalone HTML application

**Files:**
- Create: `lib/export-project.ts`
- Create: `lib/export-project.test.ts`
- Modify: `components/preview-panel.tsx`
- Modify: `components/preview-panel.test.tsx`
- Modify: `app/globals.css`
- Modify: `README.md`

**Interfaces:**
- Produces: `createProjectExport(project)` returning `{ filename, content }` and `downloadProjectHtml(project)`
- Consumes: `composePreviewDocument` and the active `Project`

- [ ] Write failing pure tests for full source composition, compatibility runtime, filename sanitization/fallback, and absence of server secrets, plus a toolbar behavior test.
- [ ] Verify focused tests fail because export helpers and UI do not exist.
- [ ] Implement sanitized project filenames and reuse the preview composer for complete standalone content.
- [ ] Add Blob URL download with guaranteed URL revocation and expose `Download HTML` in the Preview toolbar.
- [ ] Document versioning, metadata, and export; run focused tests and commit as `feat: export standalone html apps`.

### Task 4: Final delivery verification

**Files:**
- Modify only if required by verified findings

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: reviewed and pushed `main`

- [ ] Run the full test suite, ESLint, production build, and `git diff --check`.
- [ ] Verify generation metadata, revision restore, and downloaded HTML in a real browser.
- [ ] Run a final whole-branch code review and address blocking findings.
- [ ] Push the verified commits to `origin/main` and confirm synchronization.
