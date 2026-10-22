# supi-prompt-suggestions

Ghost-text prompt suggestions in the PI editor.

## Package-specific gotchas

### Editor replacement on session_start

The extension installs a `GhostTextEditor` (extends `CustomEditor`) via `setEditorComponent` on every
`session_start` (including `/reload`). This creates a fresh editor instance, discarding the previous
editor's in-memory history. History is re-seeded from the active `sessionManager.getBranch()` — see
`seedHistoryFromSession`. Recreate the shared `StatusSpinner` with the fresh `ExtensionContext` too.

### Fire-and-forget suggestion generation

`SuggestionGenerator.start()` is fire-and-forget — callers do not await the returned promise. The
class manages concurrency with an internal abort controller and generation ID. Calling `start` or
`dismiss` cancels any in-flight generation. Generation is TUI-only; print, JSON, and RPC modes do
not install the ghost editor or make background suggestion model calls. `extension.ts` creates one
`SuggestionGenerator` and one `SessionLifecycle`; the latter owns the ghost editor, spinner, and
session orchestration. Keep ownership explicit rather than using module-level wrappers. The
generator emits one bounded warning for the first failure of each model/session stream, then
suppresses repeated failures until success, a settings change, or a new session. It emits no warning
for cancellation, stale results, disabled suggestions, or empty successful output. `SessionLifecycle`
renders warnings and clears the spinner; no persistent footer error status is used. Quiet no-ghost
outcomes (no assistant text, editor not empty at settle, editor not empty at delivery) emit debug
`generation.skipped` events with a `reason` and lengths only — never suggestion or editor text.

### Suggestion model via PI registry

Suggestions use `completeSimpleModelRequest` from `@mrclrchtr/supi-core/llm`, backed by
`ctx.modelRegistry.streamSimple().result()`. PI resolves authentication,
headers, provider environment, and the effective endpoint. The request uses the stable
`prompt-suggestions` affinity scope. PI's simple path supplies model output limits and context
guards; the extension does not import Pi AI implementation subpaths. Only the last 8,000
characters of the final assistant message are sent. The system prompt instructs the model to write a single follow-up line
(question, answer, or directive) or return the `NO_SUGGESTION` sentinel. The user message wraps the
assistant text in `<assistant_message>...</assistant_message>` tags and appends `Suggestion:` — no
PI, SuPi, project, or conversation context is included.

### Settings use the fixed config adapter

The settings module uses `defineConfigSettings` and `registerSettings` from `supi-core/settings` with a
`modelPicker` field. Selecting `disabled` persists `model: "disabled"` explicitly so project scope
can override a globally enabled suggestion model; only the Inherit/Reset actions delete scoped
config keys.

### Ghost text rendering

The ghost text is injected into the editor's rendered output by post-processing the cursor line after
`super.render()`. It uses the dim ANSI escape (`\x1b[2m`) directly rather than going through the
theme system because the ghost text needs independent color control outside the editor theme.

Ghost text uses PI TUI's `wrapTextWithAnsi()` to wrap the full suggestion. Because ghost text is
visible only when the editor is empty, the extension appends it to the rendered cursor line. It uses
the public `CURSOR_MARKER` to find that line and does not parse the cursor's internal ANSI encoding.

### Suggestion acceptance

The editor accepts a visible suggestion with Right Arrow or Tab through PI's `matchesKey()`,
which handles ANSI, application, and Kitty keyboard protocol forms. Escape dismisses the visible suggestion and is consumed; a
later Escape without ghost text reaches PI's normal interrupt/double-escape handling. Editor text
suppresses the suggestion without destroying it. Any editor operation that makes the text exactly
empty restores the suggestion.

### Timeout and cancellation

`SuggestionGenerator` passes an internal abort signal to the PI registry request. An explicit timer
races the request so a provider that ignores abort still reaches a terminal timeout state. Timeout
aborts the provider request, stops the spinner, and follows the warning policy. Normal cancellation
and stale results stay quiet.
