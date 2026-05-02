## Context

The `supi-ask-user` rich overlay (`ui-rich-render.ts`) renders option `preview` content by splitting on `\n` and wrapping each line in a basic theme color. This works for ASCII mockups but ignores the "markdown" promise in the schema description. Pi-tui provides a full `Markdown` component (`@mariozechner/pi-tui/dist/components/markdown`) that supports headings, lists, blockquotes, tables, code blocks with optional syntax highlighting, and inline formatting. Pi-coding-agent exports `getMarkdownTheme()` and `highlightCode()` for seamless integration.

The preview pane lives in `renderPreviewPane()` and is used only when `env.width >= 100` (split view) or as a block below options (narrow view). The overlay already manages stable line counts via `maxHeight` padding, so replacing plain text with `Markdown` rendering must preserve that behavior.

## Goals / Non-Goals

**Goals:**
- Render option `preview` strings as Markdown in the rich overlay, with syntax highlighting for fenced code blocks.
- Re-use pi-tui's `Markdown` component and pi-coding-agent's `getMarkdownTheme()` / `highlightCode()` to avoid duplicating rendering logic.
- Preserve stable-height behavior and narrow-terminal fallback.
- Keep the change scoped to preview rendering only — no changes to questionnaire schema, answer format, or interaction flow.

**Non-Goals:**
- Markdown rendering for `prompt` or `description` fields.
- Supporting markdown extensions not handled by pi-tui (mermaid, math, footnotes, task lists, images).
- Adding new dependencies — only use what's already available from peer deps.
- Changing fallback or transcript rendering behavior.

## Decisions

### Use pi-tui `Markdown` component directly in `renderPreviewPane`

**Rationale:** The component already implements `Component` with `render(width) → string[]`, matching the overlay's line-based architecture. It handles wrapping, ANSI styling, tables, and nested lists correctly. Rolling a custom markdown→ANSI renderer would be hundreds of lines and would drift from pi-tui's behavior.

**Alternative considered:** Inline a lightweight markdown parser + custom ANSI emitter. Rejected — too much code, too easy to diverge from pi's rendering.

### Wire `highlightCode` into `MarkdownTheme.highlightCode`

**Rationale:** The `Markdown` component accepts an optional `highlightCode` callback. Pi-coding-agent exports `highlightCode(code, lang?) → string[]` which returns ANSI-highlighted lines. Passing it through gives fenced code blocks syntax highlighting without extra dependencies.

**Alternative considered:** Skip syntax highlighting to reduce complexity. Rejected — the schema explicitly mentions "code" as a preview type, and syntax highlighting is a clear UX win for config comparisons.

### Keep prompt/description plain text

**Rationale:** Prompts are wrapped via `wrapTextWithAnsi` and integrated into the overlay's line stream. Introducing a `Markdown` component there would complicate cache invalidation and height tracking. The value of block elements (tables, code blocks) in a prompt is low — prompts should be short and conversational.

### Create a shared `previewMarkdown(preview, width, theme) → string[]` helper

**Rationale:** `renderPreviewPane` (split view) and `renderPreviewBlock` (narrow fallback) both need markdown rendering. Extracting a helper avoids duplicating the `Markdown` component setup and theme mapping.

## Risks / Trade-offs

- **[Risk]** `Markdown` component adds `paddingX`/`paddingY` margins that may conflict with the pane's existing layout.
  **Mitigation:** Use `paddingX: 1, paddingY: 0` and strip/adjust as needed. Test with both split-pane and block layouts.

- **[Risk]** `highlightCode` may throw or log to stderr on malformed/missing language identifiers.
  **Mitigation:** The markdown component calls `highlightCode` during `render()`. Wrap the call in a try/catch that falls back to plain code block styling.

- **[Risk]** Markdown tables or wide code blocks may produce many lines in a narrow preview pane (~40 cols), causing the overlay to exceed terminal height.
  **Mitigation:** This is an existing risk with plain-text previews too. The `Markdown` component wraps content, which is arguably better than truncation. Document that preview authors should keep content concise.

- **[Risk]** Stable-height padding (`maxHeight`) interacts with `Markdown.render()` producing variable line counts per option.
  **Mitigation:** `maxHeight` is already computed after `renderOverlay()` returns lines. Since the markdown helper returns `string[]`, the existing padding logic applies unchanged.

## Migration Plan

No migration needed. This is a pure rendering enhancement. Existing questionnaires with plain-text previews continue to work — they just look better. No schema, API, or configuration changes.
