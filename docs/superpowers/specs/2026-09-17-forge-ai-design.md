# Forge AI MVP Design

## Product goal

Forge AI is a deployable AI-native web app builder. A user describes an app, watches a truthful execution timeline, receives a runnable sandboxed preview, and can refine the same app through follow-up prompts. Projects and conversations persist locally and can be restored from history.

## Scope and trade-offs

The MVP deliberately generates a constrained `html`/`css`/`javascript` triplet rather than a React repository. The triplet is composed into one `srcDoc` document and rendered in an iframe with `sandbox="allow-scripts"`. This removes package installation and runtime compilation from the generated-app path, keeps preview failures isolated, and makes the 6–8 hour challenge reliable.

Authentication, cloud persistence, WebContainers, multi-file React output, visual editing, generated-app deployment, and distributed agents are outside this MVP.

## Architecture

- Next.js App Router provides the client workbench and a Vercel-compatible `POST /api/generate` serverless route.
- The route reads `AI_API_KEY`, `AI_API_BASE`, and `AI_MODEL` on the server and calls an OpenAI-compatible chat-completions endpoint with a timeout and one retry.
- A dedicated system prompt constrains output. A defensive parser removes code fences, extracts the JSON object, validates every field, and returns typed error codes.
- A client generator hook owns the request lifecycle and maps real request milestones to the visible execution timeline.
- A project hook owns the current project, chat, code, localStorage persistence, history restoration, deletion, and new-project reset.
- Generated documents are composed by a pure preview helper and never share the parent origin.

## Interface design

The desktop workspace uses a 35/65 split: conversation and build activity on the left; Preview/Code on the right. The visual language is dark, restrained, and tool-like: neutral graphite surfaces, hairline borders, one warm electric accent, compact labels, and generous whitespace. On small screens, the panels stack.

The empty state explains the product in one glance and offers three example prompts. Once generation starts, it becomes a persistent conversation with request-linked agent steps. The preview toolbar switches among desktop, tablet, and mobile widths. The code view exposes HTML, CSS, and JavaScript with copy feedback. History opens as a drawer without navigating away.

## Data model and flow

`Project` stores identity, title, description, generated source, messages, suggestions, and timestamps. The browser persists the project array under `forge-ai-projects` and the active id under `forge-ai-current-project`.

For an initial build, the client sends the prompt and conversation. For refinements it also sends the current code. A successful response appends an assistant message, updates the code and metadata, calculates a deterministic build summary from the generated markup, persists the project, and refreshes the preview. Suggested improvements submit through the same refinement path.

## Failure behavior

Missing server configuration returns a specific `AI_NOT_CONFIGURED` response. Timeouts, network failures, upstream errors, and malformed model responses map to user-facing messages without clearing the last valid preview. Retry resubmits the failed prompt. Generated JavaScript errors remain inside the sandboxed iframe and cannot crash the workbench.

## Verification strategy

Pure helpers and storage behavior receive Vitest unit tests. The main workbench receives Testing Library interaction tests for example prompts, project generation, iterative editing, errors/retry, history restore/delete, and new-project behavior. Route tests exercise missing configuration, fenced JSON parsing, retry, and invalid output. Final verification runs tests, lint, production build, and browser QA at desktop and mobile sizes.

