## ADDED Requirements

### Requirement: Rich overlay SHALL NOT silently truncate wrapped content
The rich overlay renderer SHALL NOT apply `truncateToWidth` to lines that have already been width-fitted by a wrapping pass (`wrapTextWithAnsi`, `Markdown.render`, or equivalent). Pre-wrapped text that fits within the available width SHALL be rendered in full. Text that is NOT pre-wrapped (separator lines, tab bar segments) MAY still be truncated as needed.

#### Scenario: Long option label wraps, not truncates
- **WHEN** a structured question has an option with a label that exceeds the available overlay width
- **THEN** the label wraps to multiple lines rather than being cut with "..."

#### Scenario: Long option description wraps, not truncates
- **WHEN** an option description is markdown-rendered and exceeds a single line at the available width
- **THEN** the description renders across multiple lines without truncation

#### Scenario: Review answer with long text wraps, not truncates
- **WHEN** the user reviews a submitted text answer that is longer than the overlay width
- **THEN** the answer text wraps across multiple lines in the review screen without truncation

#### Scenario: Separator and tab bar lines remain truncated
- **WHEN** a separator line or tab bar segment is constructed without pre-wrapping
- **THEN** truncation is still applied as a width guarantee for these non-content elements

### Requirement: Transcript call header SHALL NOT be artificially capped
The `renderAskUserCall` transcript rendering SHALL NOT apply a hard maximum-width cap to the comma-separated question header list. The `Text` component's word-wrapping behavior SHALL be the sole mechanism for fitting the header list to the available transcript width.

#### Scenario: Two long headers wrap in transcript
- **WHEN** the agent calls `ask_user` with two questions whose headers combine to exceed a single transcript line
- **THEN** the full header text appears in the transcript, wrapped across lines if needed, without "..." truncation

#### Scenario: Four questions with short headers fit on one line
- **WHEN** the agent calls `ask_user` with four questions whose headers are short enough to fit in one transcript line
- **THEN** all headers appear inline without truncation, matching pre-change behavior for short headers
