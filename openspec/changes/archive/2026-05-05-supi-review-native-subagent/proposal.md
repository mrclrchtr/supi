## Why

supi-review currently spawns reviewer sub-agents inside detached tmux sessions using `--print` mode, communicating through temp files and polling. This requires tmux to be installed, adds session lifecycle complexity (name collisions, cleanup), and provides no live progress — `--print` mode produces no interactive TUI output, so the tmux pane is dead air. pi's SDK provides `createAgentSession()` for first-class, in-process managed child sessions with live event streaming, graceful steering, and no external dependency.

## What Changes

- **BREAKING**: Remove tmux dependency. The reviewer runs via `createAgentSession()` instead of `spawn("tmux", ...)`.
- Replace temp-file-based communication (`submit_review` tool, `-exit.json`, `-pane.log`) with direct `session.prompt()` + event subscription.
- Replace polling-based completion detection with `session.subscribe()` event-driven lifecycle.
- Replace SIGINT-based cancellation with `session.steer()` + `session.abort()` for graceful shutdown.
- Add live progress widget showing reviewer tool activity, turn count, and token usage during review.
- Remove tmux-specific error handling (tmux not installed, session name collision, kill-session cleanup).
- Drop `--print` flag from reviewer args; `createAgentSession` handles this internally.
- Preserve all user-facing behavior: same presets, depth selector, auto-fix, renderer, and structured output format.

## Capabilities

### Modified Capabilities
- `supi-review`: Replace tmux-spawned subprocess reviewer with `createAgentSession()`-based in-process reviewer. Remove tmux-specific requirements (session lifecycle, attach, kill-session). Add live progress widget. Replace temp-file communication with event-driven session management.

## Impact

- **Affected code**: `packages/supi-review/src/runner.ts` (complete rewrite), `packages/supi-review/src/runner-shared.ts` (major changes — remove tmux runner script, temp file management), `packages/supi-review/src/review.ts` (minor — wire live widget, remove `onSessionStart` tmux announce), `packages/supi-review/src/types.ts` (minor — remove warning fields, add progress types), `packages/supi-review/__tests__/` (major rewrite — all runner tests, renderer tests for tmux warnings)
- **Dependencies removed**: tmux (external system dependency)
- **Dependencies added**: None — `createAgentSession` is already in `@mariozechner/pi-coding-agent` peer dep
