# ask-user-markdown-preview

## Purpose

Defines the Markdown rendering behavior for option previews in the supi-ask-user rich overlay. Previews are rendered through pi-tui's Markdown component with syntax highlighting and graceful error handling.

## ADDED Requirements

### Requirement: Markdown preview rendering SHALL use pi-tui's Markdown component
The rich overlay SHALL render option preview content through the `Markdown` component from `@mariozechner/pi-tui` rather than plain text splitting. The component SHALL be configured with a theme mapping derived from `getMarkdownTheme()` and wired to `highlightCode()` for syntax highlighting.

#### Scenario: Markdown component is used for preview rendering
- **WHEN** the rich overlay renders a preview pane for a structured option
- **THEN** the output is produced by `Markdown.render(width)` using the preview string as input

#### Scenario: Syntax highlighting is enabled for code blocks
- **WHEN** a preview contains a fenced code block with a recognized language identifier
- **THEN** `highlightCode()` is invoked and the returned ANSI-styled lines are included in the rendered output

### Requirement: Markdown rendering SHALL gracefully handle errors
If `highlightCode()` throws or returns an unexpected result for a given code block, the markdown renderer SHALL fall back to plain code block styling without interrupting the questionnaire or logging errors to the user-facing UI.

#### Scenario: Malformed language identifier falls back safely
- **WHEN** a preview code block specifies an unsupported or malformed language identifier
- **THEN** the code block renders as plain text within the code block style, and the questionnaire remains usable

### Requirement: Markdown preview helper SHALL be shared across layouts
The overlay SHALL use a single shared helper function to render markdown previews, ensuring consistent behavior between the split-pane preview pane and the narrow-terminal preview block.

#### Scenario: Split pane and narrow block use the same markdown renderer
- **WHEN** the overlay renders a preview in either split-pane mode or narrow fallback mode
- **THEN** both code paths invoke the same markdown rendering helper with identical theme and highlighting configuration
