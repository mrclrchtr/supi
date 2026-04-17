## ADDED Requirements

### Requirement: Ask User SHALL support explicit rich questionnaire types
The `ask_user` tool SHALL accept questionnaires composed of one to four questions using explicit types: `choice`, `multichoice`, `yesno`, and `text`. Structured questions SHALL allow explicit `allowOther` and `allowDiscuss` controls, and structured options SHALL support optional preview content.

#### Scenario: Valid rich questionnaire definition
- **WHEN** the agent calls `ask_user` with a questionnaire that uses only supported question types and valid structured options
- **THEN** the extension accepts the questionnaire for execution

#### Scenario: Unsupported question type is rejected
- **WHEN** the agent calls `ask_user` with a question type outside `choice`, `multichoice`, `yesno`, or `text`
- **THEN** the extension returns a validation error instead of opening a questionnaire

### Requirement: Rich structured questions SHALL expose explicit selection actions
For structured rich-TUI questions, the extension SHALL present explicit actions for choosing an option, entering an allowed custom answer, or entering an allowed discussion path. The extension MAY supplement those actions with a context-sensitive note hotkey, but it SHALL NOT rely on implicit always-on `Other` behavior or notes as the primary interaction model.

#### Scenario: Structured choice offers custom answer explicitly
- **WHEN** a `choice` question enables `allowOther`
- **THEN** the rich UI shows an explicit action for entering a custom answer

#### Scenario: Structured choice offers discussion explicitly
- **WHEN** a structured question enables `allowDiscuss`
- **THEN** the rich UI shows an explicit action for discussing instead of forcing a selection

### Requirement: `Other` and `Discuss` SHALL support compact inline row editing
For structured rich-TUI questions, `Other` and `Discuss` SHALL edit inline on their own rows rather than opening a separate secondary input area. When one of those rows already has a saved value and is not being edited, the saved value SHALL be shown inline in the row label. Helper sub-lines for `Other` and `Discuss` SHALL be hidden, while normal option descriptions remain visible.

#### Scenario: Discuss row edits inline
- **WHEN** the user activates a `Discuss` row in rich UI
- **THEN** that row becomes an inline text input and does not open a separate input pane

#### Scenario: Keyboard focus auto-enters inline input
- **WHEN** the user navigates onto an `Other` or `Discuss` row with keyboard selection in rich UI
- **THEN** the row immediately enters inline edit mode without requiring an extra `Enter` press to begin typing

#### Scenario: Other row shows saved value inline
- **WHEN** the user previously submitted an `Other` value and later revisits that row
- **THEN** the row label shows the saved value inline until the user re-enters edit mode

#### Scenario: Other and Discuss helper rows stay compact
- **WHEN** the user views structured rows with `allowOther` or `allowDiscuss`
- **THEN** the UI does not show helper sub-lines for those two rows, while normal option descriptions remain available

### Requirement: Rich preview questions SHALL render option previews
When the current structured question includes previewable options and the terminal can support it, the rich UI SHALL render a split-pane layout with option navigation on the left and the highlighted option preview on the right. When split-pane rendering is not viable, the extension SHALL fall back to a readable single-pane presentation without losing the current selection.

#### Scenario: Preview updates with navigation
- **WHEN** the user moves between options on a previewable structured question in rich UI
- **THEN** the preview pane updates to reflect the highlighted option

#### Scenario: Narrow terminal degrades preview layout safely
- **WHEN** the terminal width is too small for a usable split-pane layout
- **THEN** the extension renders a single-pane presentation rather than truncating the questionnaire into an unusable state

### Requirement: Rich structured note hotkeys SHALL be context-sensitive
The rich UI SHALL expose a note hotkey only while the user is in non-input structured selection states. The note hotkey SHALL NOT be offered in `Other`, `Discuss`, or `text` input states. When notes are available, the UI SHALL surface that availability in the footer and SHALL display existing note state both inline on the selected row and in a separate note summary area.

#### Scenario: Note hotkey is visible on a normal structured selection
- **WHEN** the user is highlighting a normal `choice` or `yesno` option in rich UI
- **THEN** the footer advertises the note hotkey and the user can open note editing without leaving the selection flow

#### Scenario: Note hotkey is hidden in input states
- **WHEN** the user is editing an `Other`, `Discuss`, or `text` input field
- **THEN** the footer does not advertise the note hotkey and pressing `n` does not open note editing

### Requirement: Single-select notes SHALL follow the active answer before submission
For `choice` and `yesno`, the rich UI SHALL treat notes as part of the current active answer rather than as per-option permanent state. If the user edits a note and then changes the selected option before submission, the note SHALL move with the active answer.

#### Scenario: Choice note follows selection change
- **WHEN** the user adds a note while highlighting one `choice` option and then moves to a different option before submitting
- **THEN** the note is attached to the newly active answer rather than staying behind on the previously highlighted option

#### Scenario: Review shows single-select note with the submitted answer
- **WHEN** the user reviews a submitted `choice` or `yesno` answer that has a note
- **THEN** the review output shows the note alongside the final answer

### Requirement: Multichoice SHALL support per-option notes
`multichoice` questions SHALL allow the user to attach a separate note to each selectable option through the note hotkey. If the user unchecks an option, its note SHALL be preserved and restored if the same option is re-checked later in the same questionnaire. Review output for a submitted `multichoice` answer SHALL show selected options one per line with their notes.

#### Scenario: Multichoice note is preserved across uncheck and re-check
- **WHEN** the user adds a note to a `multichoice` option, unchecks it, and re-checks it before submitting
- **THEN** the previously entered note is restored for that option

#### Scenario: Review shows selected multichoice options on separate note lines
- **WHEN** the user reviews a submitted `multichoice` answer with notes on multiple selected options
- **THEN** the review output shows each selected option on its own line with its corresponding note

### Requirement: Multichoice SHALL support explicit toggle and submit behavior
`multichoice` questions SHALL allow the user to toggle multiple structured options, review the current set of selected answers, and submit that set as a successful answer. The resulting answer SHALL preserve all selected option values in a structured form.

#### Scenario: User submits multiple selected options
- **WHEN** the user selects more than one option in a `multichoice` question and submits the question
- **THEN** the result contains all selected option values for that question

#### Scenario: Multichoice review reflects selected set
- **WHEN** the user reaches review after answering a `multichoice` question
- **THEN** the review output lists the selected option labels clearly

### Requirement: Discuss SHALL be a successful answer outcome
If the user chooses a discussion path on a question that allows it, the extension SHALL record a successful `discuss` answer for that question rather than treating the interaction as a cancellation. Model-facing summaries and transcript rendering SHALL make it clear that the user chose discussion instead of a resolved decision.

#### Scenario: Discussion is submitted successfully
- **WHEN** the user chooses the discuss action for a structured question and submits the response
- **THEN** the questionnaire result records a successful discuss answer for that question

#### Scenario: Discussion is distinguished from cancellation
- **WHEN** a questionnaire includes a discuss answer and reaches submission
- **THEN** the terminal state is `submitted` rather than `cancelled`

### Requirement: Questionnaire review SHALL support revision before submission
For multi-question questionnaires and questionnaires containing `multichoice` answers, the extension SHALL present a review step before final submission and SHALL allow the user to revise answers from that review state.

#### Scenario: Multi-question flow enters review
- **WHEN** the user answers all questions in a questionnaire with more than one question
- **THEN** the extension shows a review step before final submission

#### Scenario: User revises an answer from review
- **WHEN** the user chooses to revise an answer from the review state
- **THEN** the extension returns to the relevant question without losing previously stored answers for other questions

### Requirement: Fallback SHALL provide reduced compatibility for the redesigned contract
When rich custom UI is unavailable, the extension SHALL provide a reduced fallback path for the redesigned questionnaire contract. The fallback path MAY flatten previews or simplify advanced interactions, but it SHALL either preserve the core answer semantics or return an explicit unsupported/degraded response instead of silently changing the meaning of the questionnaire.

#### Scenario: Fallback preserves core choice semantics
- **WHEN** a supported questionnaire is executed without rich custom UI
- **THEN** the fallback path still returns structured answers using the redesigned result model

#### Scenario: Unsupported fallback combination fails explicitly
- **WHEN** a questionnaire depends on an advanced rich-only affordance that fallback cannot represent safely
- **THEN** the extension reports explicit degraded or unsupported behavior instead of silently inventing a different flow

### Requirement: Ask User results SHALL use structured answer variants and terminal states
Submitted `ask_user` results SHALL include a concise model-facing summary and structured details keyed by question id. Structured details SHALL preserve answer variants for single option, multiple options, other, discuss, text, and yes/no answers, and SHALL continue to distinguish `submitted`, `cancelled`, and `aborted` terminal states.

#### Scenario: Submitted result includes answers by question id
- **WHEN** the user submits a questionnaire successfully
- **THEN** the result details contain structured answers indexed by the stable question ids

#### Scenario: Aborted questionnaire preserves terminal state
- **WHEN** questionnaire execution is interrupted by abort handling before submission completes
- **THEN** the result reports the terminal state as `aborted`
