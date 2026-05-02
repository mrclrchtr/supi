## 1. Core rendering helper

- [ ] 1.1 Create `renderMarkdownPreview(preview: string, width: number, theme: Theme) → string[]` helper in a new file (e.g., `ui-rich-render-markdown.ts`)
- [ ] 1.2 Import `Markdown` from `@mariozechner/pi-tui` and `getMarkdownTheme`, `highlightCode` from `@mariozechner/pi-coding-agent`
- [ ] 1.3 Map pi `Theme` to `MarkdownTheme` using `getMarkdownTheme()` and inject `highlightCode` into `MarkdownTheme.highlightCode`
- [ ] 1.4 Wrap `highlightCode` in a try/catch fallback to plain `codeBlock` styling

## 2. Integrate markdown rendering into overlay

- [ ] 2.1 Replace plain-text splitting in `renderPreviewPane()` with `renderMarkdownPreview()`
- [ ] 2.2 Replace plain-text splitting in `renderPreviewBlock()` with `renderMarkdownPreview()`
- [ ] 2.3 Remove now-unused plain-text preview rendering code paths
- [ ] 2.4 Verify stable-height padding (`maxHeight`) still works correctly with markdown-produced line counts

## 3. Testing

- [ ] 3.1 Add unit tests for `renderMarkdownPreview` helper (mock `Markdown` and `highlightCode`)
- [ ] 3.2 Update `ui-rich.test.ts` to assert that preview panes render markdown-formatted lines
- [ ] 3.3 Add test for `highlightCode` fallback when language identifier is malformed
- [ ] 3.4 Run `pnpm test packages/supi-ask-user/` and fix failures

## 4. Verification

- [ ] 4.1 Run `pnpm exec biome check packages/supi-ask-user/` and auto-fix issues
- [ ] 4.2 Run `pnpm typecheck` for affected packages
- [ ] 4.3 Run `pnpm verify` and ensure clean pass
- [ ] 4.4 Manual `/reload` test in pi to confirm preview rendering works end-to-end
