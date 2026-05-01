## ADDED Requirements

### Requirement: Extensions can chain multiple questionnaires
The system SHALL allow an extension to emit a follow-up `ask_user` questionnaire after receiving the result of a prior one.

#### Scenario: Follow-up question based on prior answer
- **WHEN** an extension receives a partial answer from an initial questionnaire
- **AND** the extension decides to ask a follow-up question
- **THEN** the extension can send a second `ask_user` call in the same handler or in a subsequent turn

### Requirement: Chained questionnaires maintain conversational context
The system SHALL render chained questionnaires as distinct interactions in the same conversation turn, without clearing unrelated context.

#### Scenario: Two questionnaires in sequence
- **WHEN** an extension sends questionnaire A and the user answers
- **AND** the extension immediately sends questionnaire B
- **THEN** the user sees questionnaire B after A closes, without losing prior conversation state

### Requirement: Chain depth is controlled by the extension
The system SHALL not enforce a maximum chain length; the extension author is responsible for avoiding excessive chaining.

#### Scenario: Extension controls chain length
- **WHEN** an extension implements a chain of three questionnaires
- **THEN** the system renders all three sequentially as long as the extension continues emitting them
