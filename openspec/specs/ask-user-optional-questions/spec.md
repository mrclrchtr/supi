## Purpose

TBD

## Requirements

### Requirement: Optional questions are supported in the questionnaire schema
The system SHALL allow each question in an `ask_user` questionnaire to declare `required: false`.

#### Scenario: Optional question is declared
- **WHEN** an extension sends an `ask_user` questionnaire containing a question with `required: false`
- **THEN** the system renders that question without an explicit required indicator

### Requirement: Unanswered optional questions return undefined
The system SHALL include the key for every optional question in the result object, with the value set to `undefined` when the user did not answer it.

#### Scenario: User submits without answering an optional question
- **WHEN** a questionnaire has an optional question and the user leaves it blank
- **THEN** the result object contains that question's key with value `undefined`

### Requirement: Required questions still block submission
The system SHALL prevent submission of a questionnaire while any question with `required: true` (or no explicit `required` field) remains unanswered.

#### Scenario: Required question is left blank
- **WHEN** a questionnaire has a required question that the user did not answer
- **THEN** the submit action is disabled or validation prevents submission
