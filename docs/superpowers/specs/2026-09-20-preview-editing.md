# Preview Runtime and Code Editing Design

## Goal

Make generated applications reliably interactive and let users edit generated HTML, CSS, and JavaScript in Forge, apply those edits to the live preview, and persist them with the project.

## Runtime repair

Forge's compatibility runtime and generated JavaScript currently share one script, with generated code nested inside a `try` block. A generated `const taskManager = new TaskManager()` is therefore block-scoped and unavailable to inline HTML handlers such as `onclick="taskManager.deleteTask(id)"`.

The preview document will use two classic scripts in the same global realm:

1. An isolated bootstrap script installs storage, Chart, and form compatibility without leaking its implementation names.
2. A generated-code script executes the application JavaScript at global-script scope.

This preserves the sandbox and CSP while making top-level lexical bindings visible to inline handlers. Future generated applications will be instructed to prefer `addEventListener` over inline event attributes.

## Code editing

The Code view will retain three tabs and replace its read-only source block with a styled native `textarea`. It owns a draft containing HTML, CSS, and JavaScript and derives dirty state by comparing the draft to the persisted project source.

- `Apply changes` commits the complete draft, updates the project's `updatedAt`, persists through the existing projects storage flow, and switches to Preview so the iframe reload is visible immediately.
- `Discard` restores all three files from the persisted project.
- `Unsaved changes` is visible whenever any file differs.
- `Cmd+S` and `Ctrl+S` apply a dirty draft while focus is in the editor.
- Copy copies the active draft, including unsaved text.
- Changing projects replaces the draft with that project's persisted source.

No additional editor dependency will be added.

## Verification

- A preview-runtime regression test executes the bootstrap and generated scripts in one VM context, then evaluates an inline-handler expression that calls a top-level `const taskManager`.
- Component tests exercise editing across tabs, dirty state, discard, apply, preview refresh, persistence, and the save shortcut through user-visible controls.
- The complete test, lint, and production build suites must pass.
