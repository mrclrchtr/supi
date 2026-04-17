## Why

SuPi currently lacks a first-class way for the agent to pause, ask focused clarifying questions, and resume with structured user input during a run. Existing references show strong patterns in other ecosystems, but this repo needs a pi-native `ask_user` capability that supports richer decision flows without turning into an unbounded survey tool.

## What Changes

- Add a new `ask-user/` extension that registers an `ask_user` model-callable tool for interactive user decisions and clarifications
- Support bounded multi-question questionnaires with typed questions (`choice`, `text`, `yesno`), stable IDs, short headers, and optional recommendation metadata
- Provide richer decision UX including optional `Other` responses, optional comments/notes, and a reviewable multi-question flow with explicit cancellation and abort handling
- Use rich overlay UI when available and degrade cleanly to built-in dialog/input flows when richer TUI interaction is unavailable
- Return hybrid tool results: concise natural-language summaries in `content` plus structured answer metadata in `details`
- Add prompt guidance and custom transcript rendering so the agent learns when to use `ask_user` and users can review calls/results cleanly in-session

## Capabilities

### New Capabilities
- `ask-user`: Interactive decision-gating for agent workflows, including typed questions, bounded multi-question flows, rich/fallback UI paths, and structured result reporting

### Modified Capabilities
- None

## Impact

- **New files**: `ask-user/` extension modules for schema/types, normalization, flow state, UI adapters, and rendering
- **package.json**: New extension entry added to `pi.extensions`
- **Prompt/tool surface**: Adds a new `ask_user` custom tool with prompt snippet/guidelines and custom transcript rendering
- **Runtime/UI**: Uses `ctx.ui.custom`, `ctx.ui.select`, `ctx.ui.input`, and related pi TUI APIs for interactive flows
- **Tests**: New unit/behavior tests covering normalization, bounded questionnaire behavior, fallback flows, and render output
