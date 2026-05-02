## ADDED Requirements

### Requirement: Questionnaires can expose a skip action
The system SHALL expose a "Skip" action for questionnaires when the questionnaire declares `allowSkip: true` or when at least one question is optional.

#### Scenario: Skip is available
- **WHEN** an extension sends an `ask_user` questionnaire with `allowSkip: true`
- **THEN** the rendered UI includes a "Skip" button or keybinding alongside Submit and Cancel

#### Scenario: Skip is available while typing text
- **WHEN** an extension sends a required `text` question with `allowSkip: true`
- **THEN** the rich text input exposes a skip keybinding that does not conflict with normal text entry
- **AND** pressing that keybinding returns a skipped result instead of inserting text

### Requirement: Skip returns a partial or empty result
The system SHALL return a result that includes `skip: true` and any values the user may have filled in before skipping.

#### Scenario: User skips after filling some fields
- **WHEN** a user has answered one optional question and then presses Skip
- **THEN** the result contains the answered value, `undefined` for the skipped optional question, and `skip: true`

### Requirement: Skip is distinct from cancel
The system SHALL treat Skip as a successful submission with partial data, not as an abort or cancellation.

#### Scenario: Cancel vs Skip
- **WHEN** a user presses Escape (or Cancel)
- **THEN** no result is returned and the interaction is aborted
- **AND WHEN** a user presses Skip
- **THEN** a result with `skip: true` is returned to the extension
