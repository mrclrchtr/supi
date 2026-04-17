## ADDED Requirements

### Requirement: `ask_user` tool SHALL be discoverable and decision-oriented
The system SHALL register an `ask_user` tool that the agent can call to gather focused clarifications or decisions during an active run, and SHALL advertise guidance that favors short, bounded questionnaires over broad surveys.

#### Scenario: Tool guidance appears when the tool is active
- **WHEN** the `ask_user` extension is loaded and the tool is active
- **THEN** the tool contributes a prompt snippet describing interactive user-question capability
- **AND** the tool contributes prompt guidance telling the agent to ask focused questions only when explicit user input is needed

#### Scenario: Tool call is recorded with readable intent
- **WHEN** the agent calls `ask_user`
- **THEN** the session transcript shows a concise summary of the pending question set rather than an unreadable raw parameter dump

### Requirement: `ask_user` questionnaires SHALL use a bounded typed schema
The system SHALL accept questionnaires containing one to four questions, where each question has a stable `id`, a short `header`, and a supported type of `choice`, `multichoice`, `text`, or `yesno`.

#### Scenario: Valid mixed questionnaire is accepted
- **WHEN** the tool is called with three questions using supported types and unique IDs
- **THEN** the questionnaire is accepted and presented to the user

#### Scenario: Invalid question count is rejected clearly
- **WHEN** the tool is called with zero questions or more than four questions
- **THEN** the tool returns an error explaining that `ask_user` supports one to four questions only

#### Scenario: Duplicate IDs are rejected clearly
- **WHEN** the tool is called with two questions that share the same `id`
- **THEN** the tool returns an error explaining that question IDs must be unique within a questionnaire

#### Scenario: Overlong header is rejected clearly
- **WHEN** the tool is called with a question whose `header` exceeds the supported short-header bound
- **THEN** the tool returns an error explaining that question headers must fit within the supported short-header limit

#### Scenario: Invalid option count is rejected clearly
- **WHEN** the tool is called with a `choice` question whose option count falls outside the supported bounded range
- **THEN** the tool returns an error explaining that `choice` questions must stay within the supported option-count bounds

#### Scenario: Multichoice question accepts multi-select answers
- **WHEN** the tool is called with a `multichoice` question and the user toggles one or more options and submits
- **THEN** the result records all selected option values with per-option notes if provided
- **AND** the answer source is `options` with a `selections` array

#### Scenario: Single multichoice question enters review before submission
- **WHEN** the tool is called with a single `multichoice` question and the user selects options
- **THEN** the flow enters review mode before final submission even though there is only one question

#### Scenario: Multichoice per-option notes are captured independently
- **WHEN** a `multichoice` question is active and the user adds notes to individual selected options
- **THEN** each note is stored on its corresponding selection independently

#### Scenario: Invalid recommendation target is rejected clearly
- **WHEN** the tool is called with recommendation metadata that does not point to a valid answer for the question
- **THEN** the tool returns an error explaining that the recommendation target is invalid for that question

#### Scenario: Multichoice recommendation accepts an array of option values
- **WHEN** a `multichoice` question includes a recommendation array pointing to valid option values
- **THEN** the UI highlights all recommended options
- **AND** each recommended value must match an existing option and must not be duplicated

#### Scenario: Text questions capture non-empty freeform answers
- **WHEN** the tool presents a `text` question and the user submits a non-empty string
- **THEN** the result records that string as the answer for that question

#### Scenario: Empty text submission does not become a valid answer
- **WHEN** the tool presents a `text` question and the user submits an empty string
- **THEN** the questionnaire does not record that empty string as a valid answer
- **AND** the user must either provide non-empty input or cancel the questionnaire

### Requirement: Structured questions SHALL support guided decisions
For `choice` and `yesno` questions, the system SHALL support recommendation metadata, optional `Other` responses, and optional follow-up comments without requiring the model to encode those concerns into display labels manually.

#### Scenario: Recommended option is surfaced as guidance
- **WHEN** a `choice` or `yesno` question includes recommendation metadata
- **THEN** the UI indicates which answer is recommended while preserving the original option labels as answer values

#### Scenario: `Other` captures a freeform answer for a structured question
- **WHEN** a structured question enables `Other` and the user chooses it
- **THEN** the system collects a freeform answer for that question instead of forcing one of the preset options

#### Scenario: Optional comment is captured for a structured answer
- **WHEN** a structured question enables comments and the user provides an explanatory note
- **THEN** the resulting answer records both the chosen answer and the comment

### Requirement: Multi-question questionnaires SHALL support linear reviewable flow
The system SHALL support single-question and multi-question questionnaires, allowing users to move through questions in order, review collected answers, and submit or cancel the questionnaire.

#### Scenario: Single-question questionnaire completes immediately after answer
- **WHEN** the tool is called with one question and the user answers it successfully
- **THEN** the questionnaire completes without requiring a separate review step

#### Scenario: Multi-question questionnaire supports review before submit
- **WHEN** the tool is called with multiple questions and the user reaches the final review state
- **THEN** the system shows the collected answers before final submission
- **AND** the user can still back out or cancel before the questionnaire is submitted

#### Scenario: User navigates back to revise an earlier answer
- **WHEN** the user uses the questionnaire's back-navigation affordance to revisit an earlier question and changes the answer
- **THEN** the final submitted result reflects the revised answer rather than the original one

### Requirement: `ask_user` SHALL provide rich and fallback interaction paths
The system SHALL use a rich interactive questionnaire UI when that experience is available, and SHALL fall back to built-in selection or text-input dialogs when the richer UI is unavailable but user interaction is still possible.

#### Scenario: Rich questionnaire UI is used in interactive TUI mode
- **WHEN** the session supports the custom interactive UI path
- **THEN** the user is shown a questionnaire interface that can present question context, available answers, and review state within the session

#### Scenario: Dialog fallback is used when rich UI is unavailable
- **WHEN** the session cannot use the richer questionnaire UI but still supports user dialogs
- **THEN** the system asks the same normalized questions using built-in selection, confirmation, and text-input dialogs

#### Scenario: Concurrent questionnaire request is rejected clearly
- **WHEN** an `ask_user` interaction is already active in the same extension session and the model calls `ask_user` again before it completes
- **THEN** the second tool call returns an error explaining that only one questionnaire may be active at a time

#### Scenario: No interactive UI path returns a clear error
- **WHEN** the session has no interactive UI capability for either rich or fallback questioning
- **THEN** the tool returns an error explaining that interactive user input is required

### Requirement: `ask_user` results SHALL distinguish answers, cancellation, and abort
The system SHALL return hybrid results with a concise natural-language summary in `content` and structured per-question answer data in `details`, and SHALL represent cancellation and abort as explicit terminal states rather than silent fallthrough.

#### Scenario: Successful questionnaire returns summary and structured answers
- **WHEN** the user submits a questionnaire successfully
- **THEN** the tool result `content` summarizes the answers in concise natural language
- **AND** the tool result `details` includes normalized question and answer data keyed by question ID
- **AND** each recorded answer includes source metadata describing whether it came from a preset option, `Other`, a text field, or a yes/no response

#### Scenario: User-cancelled questionnaire is explicit
- **WHEN** the user dismisses the questionnaire before submission
- **THEN** the tool result states that the questionnaire was cancelled
- **AND** the result metadata marks the terminal state as cancelled rather than answered

#### Scenario: Aborted questionnaire is explicit
- **WHEN** the tool execution `signal` is aborted while the questionnaire is active
- **THEN** the tool result ends without recording a submitted answer set
- **AND** the result metadata marks the terminal state as aborted rather than cancelled
