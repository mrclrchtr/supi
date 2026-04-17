## 1. Redesign the tool contract and normalized model

- [x] 1.1 Replace the external `ask_user` schema with explicit `choice`, `multichoice`, `yesno`, and `text` question types
- [x] 1.2 Add structured-question support for `allowOther`, `allowDiscuss`, and option-level `preview` metadata
- [x] 1.3 Redesign internal question and answer types as a discriminated union for `option`, `options`, `other`, `discuss`, `text`, and `yesno` outcomes
- [x] 1.4 Update questionnaire normalization and validation for the redesigned contract, including fallback-safe validation failures for unsupported combinations

## 2. Rework shared questionnaire flow state

- [x] 2.1 Refactor `QuestionnaireFlow` to support `multichoice` toggle/submit behavior and explicit discuss/other answer paths
- [x] 2.2 Update review and revise flow so multi-question and multichoice questionnaires can return to prior questions without losing stored answers
- [x] 2.3 Preserve submitted, cancelled, and aborted terminal-state handling under the redesigned answer model

## 3. Rebuild the rich TUI experience

- [x] 3.1 Redesign the rich renderer to support split-pane preview layout when previews are available and single-pane degradation when they are not
- [x] 3.2 Implement explicit rich UI actions for select, toggle, submit selections, other input, discuss input, and review/revise navigation
- [x] 3.3 Remove the old always-on note-centric interaction model from the primary rich flow and replace it with the new explicit action model

## 4. Adapt fallback and result rendering

- [x] 4.1 Update the fallback UI path to preserve core redesigned semantics while flattening or rejecting rich-only affordances explicitly
- [x] 4.2 Redesign result formatting and transcript rendering for the new answer variants, including clear summaries for multiselect and discuss outcomes
- [x] 4.3 Update tool guidance text and execute-path integration to describe and return the redesigned contract accurately

## 5. Rewrite tests and verify the change

- [x] 5.1 Replace normalization and result tests to cover the new schema, answer union, and validation behavior
- [x] 5.2 Add flow and rich UI tests for preview navigation, multichoice selection, discuss handling, and review/revise behavior
- [x] 5.3 Update fallback tests for reduced-compatibility behavior and explicit unsupported/degraded handling
- [x] 5.4 Run `pnpm typecheck`, `pnpm test`, and `pnpm biome:ai` to confirm the redesign is implementation-ready

## 6. Add context-sensitive note hotkeys

- [x] 6.1 Reintroduce rich-UI note editing via the `n` hotkey only for non-input structured selection states
- [x] 6.2 Implement single-select note behavior so `choice` and `yesno` notes follow the active answer before submission
- [x] 6.3 Extend `multichoice` state and answer/result models to support per-option notes that persist across uncheck/re-check within the same questionnaire
- [x] 6.4 Update rich review, summaries, and transcript rendering to show single-select notes and multi-line per-option `multichoice` notes
- [x] 6.5 Add or update tests for note hotkey visibility, single-select note movement, multichoice note persistence, and review rendering

## 7. Inline `Other`/`Discuss` rows and declutter the rich UI

- [x] 7.1 Render `Other` and `Discuss` as inline-editable rows instead of opening a separate rich input area
- [x] 7.2 Show saved `Other` and `Discuss` values inline on their row labels when not actively editing
- [x] 7.3 Remove helper sub-lines and duplicate saved-value status for `Other` and `Discuss` while keeping normal option descriptions
- [x] 7.4 Add or update tests for inline row editing, revisit/prefill behavior, and compact row rendering
- [x] 7.5 Auto-enter inline `Other`/`Discuss` input when keyboard navigation lands on those rows
