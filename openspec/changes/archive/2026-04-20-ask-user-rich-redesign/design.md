## Context

`ask_user` already exists in SuPi as a modular extension with separate files for schema validation, normalization, questionnaire flow, rich UI rendering, fallback interaction, result formatting, and transcript rendering. That structure is a good base, but the current implementation centers on a narrow structured-choice model with implicit `Other`, optional notes, and a review flow that does not scale well to richer interactions.

The redesign is driven by a richer terminal UX target informed by the Claude Code reference. The most important gaps are first-class option previews, checkbox-style multi-select, and a dedicated discussion path when the user wants to talk instead of decide. The repo also already has a complete `ask-user-tool` change, so this work is explicitly a successor redesign rather than a continuation of the original v1 implementation.

The project constraints are:
- keep the extension TypeScript-first and build-step-free
- preserve the repo's small-module architecture
- prioritize the rich TUI experience over RPC/fallback parity
- allow breaking changes in the tool contract when they produce a cleaner long-term model

## Goals / Non-Goals

**Goals:**
- Redesign the `ask_user` contract around explicit question types: `choice`, `multichoice`, `yesno`, and `text`
- Support option-level `preview` data and a split-pane rich TUI when previews are present
- Make `allowOther` and `allowDiscuss` explicit per-question controls for structured flows
- Redesign answer/result semantics to represent single-select, multi-select, other, discuss, text, and yes/no outcomes cleanly
- Replace the old always-on note-centric rich UI with explicit actions for choose, toggle, other, discuss, review, and revise while restoring a context-sensitive note hotkey where it improves structured decisions
- Keep fallback support as a reduced-compatibility path without constraining the rich TUI design
- Retain the current modular implementation shape so each concern stays testable and reviewable

**Non-Goals:**
- Preserving backward compatibility with the current `ask_user` question schema or answer payloads
- Achieving feature parity between rich TUI and fallback UI
- Reproducing Claude Code's API shape exactly
- Building a general-purpose survey engine with arbitrary branching or unlimited question counts
- Adding web/browser UI or non-terminal rendering for this redesign

## Decisions

### 1. Use explicit question kinds, including `multichoice`

**Decision**: Replace the current structured-question model with explicit `choice`, `multichoice`, `yesno`, and `text` types.

**Rationale**: `multichoice` is clearer and easier to validate than overloading `choice` with a boolean flag. It also produces cleaner flow logic, clearer result unions, and simpler transcript summaries.

**Alternatives considered**:
- `choice` plus `multiSelect: true`: rejected because it makes the external contract and internal state more conditional.
- Keeping only `choice`, `text`, and `yesno`: rejected because multi-select is a core redesign goal.

### 2. Make previews first-class option metadata in the schema

**Decision**: Add `preview?: string` to structured options and teach the rich UI to render a two-pane layout whenever the current question has previewable options.

**Rationale**: Previews are most useful when they are part of the question contract instead of an ad hoc rendering detail. First-class metadata lets normalization validate and preserve them, and keeps the renderer simple: the left pane handles choice state while the right pane reflects the highlighted option.

**Alternatives considered**:
- Leaving previews out of the schema and deriving them from descriptions: rejected because descriptions are too short and semantically different.
- Supporting previews only for `choice`: rejected because `multichoice` also benefits from previewable options.

### 3. Separate `Other` from `Discuss`

**Decision**: Replace the current always-on implicit escape hatch with explicit `allowOther` and `allowDiscuss` controls on structured questions.

**Rationale**: `Other` and `Discuss` represent different user intents. `Other` means "none of these options fit, here is my answer" while `Discuss` means "I am not ready to decide; continue conversationally." Making them explicit improves validation, UI clarity, and agent behavior after submission.

**Alternatives considered**:
- Keeping a single implicit `Other` row and relying on comments for nuance: rejected because it conflates custom answers with unresolved discussion.
- Allowing `Discuss` on all question types automatically: rejected because text questions are already conversational by nature.

### 4. Redesign answer/result payloads as a discriminated union

**Decision**: Replace the current flat answer shape with a discriminated union that can represent `option`, `options`, `other`, `discuss`, `text`, and `yesno` outcomes while preserving `answers`, `answersById`, and terminal state metadata.

**Rationale**: Multi-select and discuss are not natural fits for the current single-value answer model. A discriminated union keeps result semantics explicit, makes transcript rendering more accurate, and prevents consumers from guessing how to interpret arrays versus scalars.

**Alternatives considered**:
- Extending the current answer shape with optional arrays and flags: rejected because it would become ambiguous and brittle.
- Returning only natural-language summaries: rejected because the transcript and future tooling need structured data.

### 5. Treat rich TUI as the primary product and fallback as degraded support

**Decision**: Keep both `ui-rich.ts` and `ui-fallback.ts`, but design advanced behavior around the rich path first. Fallback may flatten previews, simplify multi-select, or reject combinations that depend heavily on rich affordances.

**Rationale**: The rich TUI experience is the point of the redesign. Forcing full fallback parity would weaken the main interaction model and increase implementation complexity without improving the primary use case.

**Alternatives considered**:
- Rich-only: rejected because a reduced fallback still provides useful compatibility in non-custom-UI sessions.
- Full parity fallback: rejected because it would drive design toward the least-capable environment.

### 6. Restore notes as a context-sensitive hotkey, not a first-class row

**Decision**: Keep explicit rows/actions for select, other, discuss, submit selections, and review, but restore notes as a secondary `n` hotkey that is available only in non-input structured selection states. `choice` and `yesno` keep one note for the active answer, while `multichoice` stores notes per option and preserves them across uncheck/re-check within the same questionnaire. The hotkey is disabled in `Other`, `Discuss`, and `text` input states.

**Rationale**: Removing notes entirely made rationale capture weaker for resolved answers, but turning notes back into a permanent row would re-clutter the main selection UI. A context-sensitive hotkey keeps the screen clean while restoring fast keyboard support for "I chose this, and here is why". The per-option `multichoice` rule matches the richer semantics of multi-select decisions better than a single note for the whole selection.

**Alternatives considered**:
- Keeping notes fully removed: rejected because users still need lightweight rationale on structured decisions.
- Adding an explicit `Add note` row: rejected because it adds list clutter and competes with `Other`/`Discuss`.
- Using one note for the entire `multichoice` answer: rejected because users may want different rationale for different selected items.

### 7. Make `Other` and `Discuss` inline editable rows

**Decision**: Keep `Other` and `Discuss` as explicit structured action rows, but make their editing inline on the row itself rather than opening a separate input area. When the user navigates onto one of those rows with the keyboard, the row enters inline edit mode immediately without requiring a second confirmation keystroke. When not actively editing, any saved value is shown inline on the same row label. Helper sub-lines for those two rows are hidden to keep the list compact, while normal option descriptions remain visible.

**Rationale**: The separate input area made the screen feel visually heavy and duplicated information once saved values were also shown elsewhere. Inline row editing keeps focus inside the list, makes revisit behavior more obvious, and removes extra chrome without changing the answer model.

**Alternatives considered**:
- Keeping the separate input area: rejected because it adds clutter and over-emphasizes `Other`/`Discuss` compared to normal options.
- Showing saved values on a separate muted line: rejected because the value belongs to the row and is easier to scan inline.
- Hiding all descriptions globally: rejected because normal options still benefit from short descriptions.

## Risks / Trade-offs

- **[Breaking the current tool contract]** → Document the new schema clearly in prompt guidance, update tests together with implementation, and treat the redesign as a new change rather than a silent patch.
- **[Rich UI complexity increases significantly]** → Keep the modular split between schema, flow, event handling, and rendering so complexity is partitioned and testable.
- **[Inline row editing could reduce text-edit affordances]** → Scope inline editing only to `Other` and `Discuss`, keep `text` and note editing on the existing editor path, and preserve revisit/prefill behavior.
- **[Fallback behavior may feel inconsistent]** → Be explicit about degraded behavior and fail fast when a questionnaire depends on unsupported advanced affordances.
- **[Preview rendering could overwhelm narrow terminals]** → Render a single-pane mode when width is insufficient and reserve split-pane layout for viable widths.
- **[Agent behavior after `discuss` could become ambiguous]** → Make `discuss` a first-class successful answer source with explicit model-facing summary text.
- **[Per-option multichoice notes complicate the answer model]** → Represent multichoice selections as structured entries that can carry individual notes and preserve staged note state in the flow/controller.

## Migration Plan

1. Create the new spec and design artifacts for the redesign.
2. Rework the external schema and normalized internal types to support the new question and answer model.
3. Update shared flow state to support `multichoice`, `other`, `discuss`, richer review, revised terminal semantics, and staged note state.
4. Rebuild the rich renderer/controller around explicit actions, preview panes, and context-sensitive note editing.
5. Reduce and adapt fallback behavior to the new contract.
6. Extend the answer model and rendering logic to capture single-select notes and per-option multichoice notes.
7. Refine `Other` and `Discuss` rendering into inline editable rows and remove duplicate helper/status clutter for those rows.
8. Rewrite and extend tests for the redesigned normalization, flow, render, note, and result behavior.
9. Roll out the change as the new `ask_user` contract; rollback is reverting the redesign commit and restoring the previous implementation files.

## Open Questions

- None for the artifact phase. The main product decisions are resolved: explicit `multichoice`, first-class previews, explicit `Other`/`Discuss`, context-sensitive note hotkeys, rich-first UX, and limited fallback.
