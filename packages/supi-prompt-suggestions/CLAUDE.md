# supi-prompt-suggestions

Ghost-text prompt suggestions in the PI editor.

## Package-specific gotchas

### Editor replacement on session_start

The extension installs a `GhostTextEditor` (extends `CustomEditor`) via `setEditorComponent` on every
`session_start` (including `/reload`). This creates a fresh editor instance, discarding the previous
editor's in-memory history. History is re-seeded from `sessionManager.getEntries()` — see
`seedHistoryFromSession`.

### Fire-and-forget suggestion generation

`SuggestionGenerator.start()` is fire-and-forget — callers do not await the returned promise. The
class manages concurrency with an internal abort controller and generation ID. Calling `start` or
`dismiss` cancels any in-flight generation. `extension.ts` owns the `SuggestionGenerator` instance
directly rather than going through module-level wrappers.

### Suggestion model via completeSimple

Suggestions use `completeSimple` (not `createAgentSession`). Only the last 8,000 characters of the
final assistant message are sent. The system prompt is intentionally empty — the model receives only
a simple `Assistant> …\nUser> ` continuation format with no PI, SuPi, project, or conversation
context.

### Settings use registerConfigSettings

The settings section uses `registerConfigSettings` from `supi-core/config`. The `buildItems` callback
receives `ctx` as its 4th parameter to resolve the scoped model list.

### Ghost text rendering

The ghost text is injected into the editor's rendered output by post-processing the cursor line after
`super.render()`. It uses the dim ANSI escape (`\x1b[2m`) directly rather than going through the
theme system because the ghost text needs independent color control outside the editor theme.

Ghost text insertion position depends on `CustomEditor`'s internal ANSI encoding of the cursor
(inverse-video `\x1b[7m` … `\x1b[0m`). See `ghostInsertPosition()` in `editor.ts` — if upstream
cursor rendering changes, that helper must be updated.

### Right Arrow acceptance

The editor intercepts Right Arrow (ANSI `\x1b[C`, application `\x1bOC`, and Kitty keyboard protocol
forms) to accept the suggestion. Any other input dismisses it and falls through to the parent
`CustomEditor` handling.

### Spinner lifecycle

The `StatusSpinner` is recreated on every `session_start` with a fresh `ExtensionContext`. On
`session_shutdown`, the spinner is stopped and the generator dismissed to prevent interval leaks.

### Abort signal combination

The `withTimeout()` helper in `generator.ts` combines the caller's abort signal with a generation
timeout signal. It returns a cleanup function that callers must invoke in a `finally` block to avoid
listener leaks.
