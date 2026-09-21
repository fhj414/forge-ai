# Delivery Confidence Features Design

## Goal

Add three interview-ready capabilities that make Forge safer to iterate, easier to deliver, and more transparent about real AI execution: revision history, standalone HTML export, and verified generation metadata.

## 1. Real generation metadata

The server records metadata around the actual provider request and validated result. A successful `/api/generate` response includes:

- the configured model identifier;
- elapsed milliseconds covering provider request, retry, parsing, and schema validation;
- `initial` or `refinement`, derived from whether current source was supplied;
- total source lines and UTF-8 bytes across HTML, CSS, and JavaScript;
- `schemaValidated: true`, which is only emitted after the generated payload passes the output schema.

Provider output parsing remains separate from API response parsing: `GeneratedApp` is the model-authored artifact, while `GeneratedBuild` adds trusted server metadata. The client validates both layers before committing the project. Metadata is saved with the project and displayed in the build summary. Older saved projects without metadata remain loadable and simply omit metadata rows.

## 2. Version history and restore

Each project tracks its current revision source and creation time plus at most ten prior snapshots. A snapshot contains the complete generated artifact state that affects delivery: title, description, HTML, CSS, JavaScript, suggestions, and the last generation metadata. Conversation messages are an audit trail and are not rolled back.

Before an AI refinement, manual Apply, or Restore mutates the project, Forge snapshots the current state. Sources are displayed as `Initial AI`, `AI refinement`, `Manual edit`, and `Restore`. Restoring a prior revision first snapshots the current state, removes the selected snapshot from the historical list, makes it current, marks the new current revision as `Restore`, and preserves the ability to return to the state that was replaced. The history is capped after every mutation.

A dedicated version-history drawer for the active project lists revisions newest first with source, exact local timestamp, title, and code size. Each item has a one-click Restore action. Version-changing actions are unavailable while AI generation is running or manual code is dirty. Existing localStorage projects are migrated through schema defaults.

## 3. Standalone HTML export

The Preview toolbar exposes `Download HTML` whenever a project exists. Export reuses the full document composer already used by the sandbox preview, producing one UTF-8 `.html` file with embedded CSS, JavaScript, form protection, storage compatibility, and Chart compatibility. The output contains no server configuration or API key.

The filename uses the project title, removes filesystem-invalid characters and control characters, trims trailing dots/spaces, and falls back to `forge-app.html`. Browser download uses a Blob URL that is revoked after the click.

## Compatibility and constraints

- Existing opaque-origin sandbox and CSP protections remain unchanged.
- Existing locally saved projects continue to load.
- No new runtime dependency is added.
- Version history retains exactly the most recent ten prior versions per project.
- API keys and server-only environment configuration never enter generated projects, metadata, history, or downloads.
- All new behavior follows test-first development and must pass the full test, lint, build, browser, and review gates.
