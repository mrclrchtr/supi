## ADDED Requirements

### Requirement: Rich overlay SHALL produce stable line counts within a question
The rich overlay's `render()` SHALL return a consistent number of lines across re-renders for the same question, regardless of which option is currently highlighted. When a render produces fewer lines than a previous render for the same question, the output SHALL be padded with empty lines to match the maximum observed height. The maximum height tracker SHALL reset when navigating to a different question or when the terminal width changes.

#### Scenario: Navigating from long preview to no preview preserves line count
- **WHEN** the user navigates from an option with a multi-line preview to an option with no preview
- **THEN** the rendered output has the same number of lines as the previous render, with empty lines padding the difference

#### Scenario: Navigating from no preview to long preview grows line count
- **WHEN** the user navigates from an option with no preview to an option with a multi-line preview
- **THEN** the rendered output grows to accommodate the longer preview and the maximum height tracker updates to the new height

#### Scenario: Max height resets on question change
- **WHEN** the user advances from one question to the next in a multi-question questionnaire
- **THEN** the maximum height tracker resets so the new question is not padded to the previous question's height

#### Scenario: Max height resets on terminal width change
- **WHEN** the terminal width changes during a questionnaire
- **THEN** the maximum height tracker resets since line counts depend on available width

## MODIFIED Requirements

### Requirement: Rich preview questions SHALL render option previews
When the current structured question includes previewable options and the terminal can support it, the rich UI SHALL render a split-pane layout with option navigation on the left and the highlighted option preview on the right. When split-pane rendering is not viable, the extension SHALL fall back to a readable single-pane presentation without losing the current selection. The total rendered height SHALL remain stable across option navigation within the same question.

#### Scenario: Preview updates with navigation
- **WHEN** the user moves between options on a previewable structured question in rich UI
- **THEN** the preview pane updates to reflect the highlighted option

#### Scenario: Narrow terminal degrades preview layout safely
- **WHEN** the terminal width is too small for a usable split-pane layout
- **THEN** the extension renders a single-pane presentation rather than truncating the questionnaire into an unusable state

#### Scenario: Height remains stable across preview changes
- **WHEN** the user navigates between options with different preview lengths
- **THEN** the total rendered line count does not decrease, preventing differential rendering artifacts
