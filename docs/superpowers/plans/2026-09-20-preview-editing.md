# Preview Runtime and Code Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair generated app instance visibility and add a persistent, live code-editing workflow.

**Architecture:** Split the preview compatibility runtime from generated JavaScript so application declarations execute at global-script scope. Keep editing state in `CodeViewer`, route committed `AppCode` through `PreviewPanel` to `useProjects`, and reuse existing project persistence and iframe refresh behavior.

**Tech Stack:** Next.js, React 19, TypeScript, Vitest, Testing Library, native textarea and browser APIs

**Spec:** `docs/superpowers/specs/2026-09-20-preview-editing.md`

## Global Constraints

- Keep the existing opaque-origin iframe sandbox, CSP, storage shim, form protection, and Chart-compatible runtime.
- Add no editor dependency.
- Apply writes HTML, CSS, and JavaScript atomically and persists via the existing project store.
- Follow red-green-refactor for every production behavior.

---

### Task 1: Expose generated application instances to inline handlers

**Files:**
- Modify: `lib/preview.test.ts`
- Modify: `lib/preview.ts`
- Modify: `prompts/app-builder.ts`

**Interfaces:**
- Consumes: `composePreviewDocument(code: AppCode): string`
- Produces: a preview document whose runtime and application scripts share a global realm without nesting application declarations in a block

- [ ] **Step 1: Write the failing regression test**

Create a VM context, run each script from the composed document in source order, then evaluate `taskManager.completeTask()` where the generated source defines `const taskManager = new TaskManager()`. Assert the visible task state changes.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- lib/preview.test.ts`

Expected: FAIL with `taskManager is not defined`.

- [ ] **Step 3: Implement the runtime split**

Wrap only Forge compatibility setup in an IIFE in the first script, assign public compatibility APIs to `window`, and place sanitized generated JavaScript directly in a second classic script. Update the generation prompt to prefer `addEventListener` and reject inline handler attributes for new code.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npm test -- lib/preview.test.ts lib/preview-form.test.ts`

Expected: all preview tests PASS with no logged runtime errors.

- [ ] **Step 5: Commit the runtime repair**

Commit message: `fix: expose generated app instances in previews`

### Task 2: Add persistent code editing

**Files:**
- Modify: `components/code-viewer.tsx`
- Modify: `components/preview-panel.tsx`
- Modify: `components/builder-workspace.tsx`
- Modify: `hooks/use-projects.ts`
- Modify: `components/builder-workspace.test.tsx`
- Modify: `components/preview-panel.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `AppCode`, the active `Project`, and existing localStorage persistence
- Produces: `updateCurrentProject(code: AppCode): void` and `CodeViewer({ code, onApply })`

- [ ] **Step 1: Write failing component tests for edit, discard, apply, persistence, and shortcut**

Exercise the real workspace: open Code, edit the labeled source textarea, observe `Unsaved changes`, discard once, edit again, apply, observe Preview, and assert localStorage contains the edited source. Add a focused Code/Preview component case proving `Control+S` applies a dirty draft.

- [ ] **Step 2: Run focused component tests and verify RED**

Run: `npm test -- components/builder-workspace.test.tsx components/preview-panel.test.tsx`

Expected: FAIL because the read-only code block has no editor or apply actions.

- [ ] **Step 3: Add project code updates**

Add `updateCurrentProject(code: AppCode)` to `useProjects`; update only the current project's three source fields and set `updatedAt` to a value greater than its previous timestamp so iframe keys always refresh.

- [ ] **Step 4: Implement the editor interaction**

Store a complete code draft, synchronize it when persisted code changes, render the active file in a labeled textarea, derive dirty state, copy the active draft, implement Discard, and invoke `onApply(draft)` for the Apply button or platform save shortcut.

- [ ] **Step 5: Wire Apply to preview and persistence**

Pass `updateCurrentProject` from `BuilderWorkspace` through `PreviewPanel`; after applying, switch the panel to Preview. Style the textarea, action buttons, dirty indicator, disabled states, and narrow layouts.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- components/builder-workspace.test.tsx components/preview-panel.test.tsx`

Expected: all focused component tests PASS.

- [ ] **Step 7: Commit the editor feature**

Commit message: `feat: add persistent code editing`

### Task 3: Delivery verification

**Files:**
- Modify if needed: `README.md`

**Interfaces:**
- Consumes: both completed changes
- Produces: a tested and pushed `main` branch

- [ ] **Step 1: Run all verification commands**

Run `npm test`, `npm run lint`, and `npm run build` and require zero failures.

- [ ] **Step 2: Review the diff and update user documentation**

Document editable code, Apply/Discard, save shortcut, persistence, and preview compatibility only if the current README feature list would otherwise be inaccurate.

- [ ] **Step 3: Push the verified commits**

Push `main` to `origin` and confirm the remote branch contains both commits.
