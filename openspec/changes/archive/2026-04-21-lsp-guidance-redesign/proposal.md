## Why

LSP guidance messages are injected as `role: "user"` messages that agents confuse with actual user instructions. This causes agents to act on guidance instead of the user's prompt, wastes tokens and turns, and breaks LLM prompt caching. The reactive tracking state machine (activation flags, fingerprinting, path tracking) is complex machinery that exists only to decide when to inject these problematic messages.

## What Changes

- **BREAKING**: Remove bash-guard steer nudge (`sendMessage`/`deliverAs: "steer"`) — no more mid-turn LSP suggestions injected as user-role messages
- **BREAKING**: Remove reactive runtime tracking state machine (`runtimeActive`, `pendingActivation`, `trackedSourcePaths`, fingerprint dedup, `guidanceToken`/`guidanceCounter`)
- **BREAKING**: Remove `tree-sitter-bash` and `web-tree-sitter` dependencies
- **BREAKING**: Remove `recent-paths.ts` (path tracking and session persistence for relevance matching)
- Add proactive project scan at `session_start`: detect rootMarkers + check `commandExists` for each configured server
- Add topmost-root deduplication for multi-root projects (monorepo support)
- Add eager LSP server startup at `session_start` for all detected servers (parallel, no files opened)
- Re-register `lsp` tool at `session_start` with project-specific `promptGuidelines` (capabilities + action parameter hints) so they become part of `_baseSystemPrompt` — guaranteeing prompt cache stability
- Move diagnostics injection from hidden `role: "user"` message to XML-framed `<extension-context>` prepended before the user's actual prompt via `context` event reordering
- Inject diagnostics only when outstanding diagnostics exist (zero extra tokens in the common case)
- Add `ctx.ui.notify()` call when diagnostic context is injected so the human knows, without any LLM cost
- Inline diagnostics on `write`/`edit` tool results remain unchanged

## Capabilities

### New Capabilities
- `lsp-proactive-scan`: Project scanning at session_start to detect available LSP servers, find project roots (with topmost-root dedup for monorepos), and eagerly start matched servers
- `lsp-diagnostic-context`: XML-framed diagnostic injection as a prepended user message with `<extension-context>` tags, only when diagnostics exist, with human notification via `ctx.ui.notify()`

### Modified Capabilities
- `lsp-tool-guidance`: Prompt guidelines become project-specific (include detected server names and file types) and are baked into `_baseSystemPrompt` at session_start instead of using static defaults. Soft nudge via steer is removed entirely. Action parameter hints added to guidelines.
- `lsp-agent-context`: Replaced by `lsp-proactive-scan` and `lsp-diagnostic-context`. The reactive tracking state machine, activation flags, fingerprint dedup, and path-based relevance matching are all removed.
- `bash-guard-soft-nudge`: Removed entirely. The steer-based nudge, TreeSitter bash parsing, and directory scanning infrastructure are deleted along with their dependencies.

## Impact

### Code
- **Delete**: `bash-guard.ts`, `bash-guard-directory.ts`, `runtime-state.ts`, `recent-paths.ts`
- **New**: `scanner.ts` (project scanning, root dedup, eager startup)
- **Heavy rewrite**: `guidance.ts` (strip reactive logic, add `buildProjectGuidelines()` and `formatDiagnosticsContext()`)
- **Heavy rewrite**: `lsp.ts` (new session_start flow, simplified before_agent_start, context event reordering, remove bash nudge and tracking)
- **Update**: `ui.ts` (overlay and status bar use scan data from session_start, show server info before files are opened)
- **Simplify**: `overrides.ts` (remove recent-path tracking callbacks)
- **Update**: `__tests__/guidance.test.ts`, `__tests__/bash-guard.test.ts` (rewrite/delete)

### Dependencies
- **Remove**: `tree-sitter-bash`, `web-tree-sitter` from `package.json`

### API / Behavior
- Agents no longer receive "LSP guidance:" or "LSP ready for..." user-role messages
- Agents see LSP capabilities as part of the system prompt (stable, cached)
- Agents see diagnostic context as `<extension-context>` prepended before their prompt (only when diagnostics exist)
- LSP servers start eagerly at session_start instead of lazily on first file touch
- Human users see `ctx.ui.notify()` when diagnostic context is injected
