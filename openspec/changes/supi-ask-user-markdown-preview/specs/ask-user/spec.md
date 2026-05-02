## MODIFIED Requirements

### Requirement: Rich preview questions SHALL render option previews as Markdown
When the current structured question includes previewable options and the terminal can support it, the rich UI SHALL render a split-pane layout with option navigation on the left and the highlighted option preview on the right. The preview pane SHALL render the option `preview` string as Markdown, including syntax highlighting for fenced code blocks. When split-pane rendering is not viable, the extension SHALL fall back to a readable single-pane presentation without losing the current selection. The total rendered height SHALL remain stable across option navigation within the same question.

#### Scenario: Preview updates with navigation and renders Markdown
- **WHEN** the user moves between options on a previewable structured question in rich UI
- **THEN** the preview pane updates to reflect the highlighted option and renders its content as Markdown with proper formatting

#### Scenario: Code block preview receives syntax highlighting
- **WHEN** an option preview contains a fenced code block with a language identifier
- **THEN** the preview pane renders the code block with syntax-highlighted lines

#### Scenario: Narrow terminal degrades preview layout safely
- **WHEN** the terminal width is too small for a usable split-pane layout
- **THEN** the extension renders a single-pane presentation rather than truncating the questionnaire into an unusable state

#### Scenario: Height remains stable across preview changes
- **WHEN** the user navigates between options with different preview lengths
- **THEN** the total rendered line count does not decrease, preventing differential rendering artifacts
