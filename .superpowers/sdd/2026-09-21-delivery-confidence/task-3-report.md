# Task 3 report: standalone HTML export

## Implementation

- Added `createProjectExport(project)`, which returns a sanitized `.html` filename and the complete document from `composePreviewDocument(project)`.
- Sanitization removes filesystem-invalid characters and control characters, trims trailing dots/spaces, and falls back to `forge-app.html` when no usable title remains.
- Added `downloadProjectHtml(project)`, which creates a UTF-8 HTML `Blob`, downloads it through a temporary anchor, and revokes the object URL in a `finally` block even when clicking the anchor throws.
- Added `Download HTML` to the Preview toolbar whenever a project is active, preserving the existing code editor, preview, viewport controls, and version-history controls.
- Documented generation metadata, capped version history, and standalone export in `README.md`.

## Files

- Created `lib/export-project.ts`
- Created `lib/export-project.test.ts`
- Updated `components/preview-panel.tsx`
- Updated `components/preview-panel.test.tsx`
- Updated `app/globals.css`
- Updated `README.md`

## TDD evidence

### RED

Ran:

```text
npm test -- --run lib/export-project.test.ts components/preview-panel.test.tsx
```

Before implementation, Vitest reported the expected missing behavior:

- `lib/export-project.test.ts` failed to resolve `@/lib/export-project`.
- The active-project toolbar test failed because `Download HTML` was not rendered.
- Existing PreviewPanel tests still passed (2 passed, 1 failed in the file with the new test).

### GREEN

Ran:

```text
npm test -- --run lib/export-project.test.ts components/preview-panel.test.tsx
```

Result: 2 test files passed, 8 tests passed.

## Full verification

- `npm test` — 12 test files passed, 56 tests passed.
- `npm run lint` — passed with no ESLint errors.
- `npm run build` — production Next.js build passed, including TypeScript checking.
- `git diff --check` — passed with no whitespace errors.

## Self-review

- Export content is composed by the same preview composer, so CSP, form protection, in-memory storage compatibility, and native Chart compatibility stay aligned with the iframe preview.
- The helper does not read or interpolate server environment variables; the output contains no server configuration added by the export path.
- Object URL cleanup covers both successful and throwing anchor clicks.
- Existing PreviewPanel editing and version-history behavior remains unchanged.

## Concerns

No blocking concerns. `downloadProjectHtml` intentionally requires browser `Blob`, `URL`, and `document` APIs and is only called from the client-side Preview toolbar.
