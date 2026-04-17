## Why

The current `ask_user` extension works for basic questionnaires, but its interaction model is too limited for richer agent-guided decisions. It lacks first-class option previews, true multi-select, and a dedicated discussion path, which now makes the experience feel noticeably weaker than the Claude-inspired reference we want to learn from.

## What Changes

- Redesign `ask_user` as a rich-TUI-first decision tool with a stronger questionnaire model and richer interaction flow.
- Add explicit question types: `choice`, `multichoice`, `yesno`, and `text`.
- Add option-level `preview` content for rich split-pane comparisons in the TUI.
- Add explicit `allowOther` and `allowDiscuss` controls for structured questions instead of always-on implicit escape hatches.
- Redesign result payloads around richer answer variants, including first-class multi-select and discuss outcomes.
- Replace the old always-on note-centric rich UI with explicit actions for selecting, entering another answer, discussing, reviewing, and revising.
- Re-introduce notes as a context-sensitive hotkey on non-input structured selection states, including per-option notes for `multichoice`.
- Refine `Other` and `Discuss` into compact inline-editable rows, auto-enter inline input when those rows gain keyboard focus, and reduce rich-UI clutter by hiding helper sub-lines for those action rows.
- Keep fallback UI only as a reduced compatibility path; rich TUI becomes the primary product experience.
- **BREAKING**: Replace the current `ask_user` questionnaire contract and answer/result semantics with the redesigned typed model.

## Capabilities

### New Capabilities
- `ask-user`: Rich questionnaire workflows for agent-user decision making, including previews, multi-select, inline `Other`/`Discuss` editing, context-sensitive note hotkeys, review/revise behavior, and structured result semantics.

### Modified Capabilities
- None.

## Impact

- Affects `ask-user/schema.ts`, `ask-user/normalize.ts`, `ask-user/types.ts`, `ask-user/flow.ts`, `ask-user/ui-rich.ts`, `ask-user/ui-rich-render.ts`, `ask-user/ui-fallback.ts`, `ask-user/result.ts`, and `ask-user/render.ts`.
- Changes the model-facing `ask_user` tool contract, rich TUI behavior, note semantics, compact structured-row behavior, and transcript/result rendering.
- Requires updated tests for normalization, flow state, rich UI rendering, fallback behavior, and result formatting.
