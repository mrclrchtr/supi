## Why

The `ask_user` tool's schema advertises that option `preview` content supports "markdown, code, or ASCII mockups", but the rich overlay currently renders previews as plain text (`split("\n")` with basic theming). This gap means code snippets in previews lose syntax highlighting, tables lose structure, and markdown formatting is invisible. Closing this gap makes config comparisons and code-heavy option previews actually readable.

## What Changes

- Update `supi-ask-user` rich overlay to render option `preview` content through pi-tui's `Markdown` component instead of plain text splitting.
- Wire `pi-coding-agent`'s exported `highlightCode()` into the markdown renderer for syntax-highlighted code blocks.
- Map pi's `Theme` to `MarkdownTheme` via the existing `getMarkdownTheme()` utility.
- Ensure stable line counts and height behavior are preserved when markdown rendering replaces plain text.
- Update tests to verify markdown rendering integration (mock `Markdown` component and `highlightCode`).

## Capabilities

### New Capabilities
- `ask-user-markdown-preview`: Rich option preview rendering with full markdown support and syntax highlighting.

### Modified Capabilities
- `ask-user`: Update the preview rendering behavior to use markdown parsing instead of plain text splitting. No schema or API changes.

## Impact

- `packages/supi-ask-user/ui-rich-render.ts` — preview pane rendering logic
- `packages/supi-ask-user/__tests__/ui-rich.test.ts` — add coverage for markdown-rendered previews
- Peer dependency usage: `@mariozechner/pi-tui` (Markdown component), `@mariozechner/pi-coding-agent` (`getMarkdownTheme`, `highlightCode`)
