## 1. Call header untruncation

- [x] 1.1 Remove `MAX_HEADER_LIST` constant from `render.ts`
- [x] 1.2 Remove `truncateToWidth(headers.join(", "), MAX_HEADER_LIST)` from `renderAskUserCall`, replace with raw `headers.join(", ")`
- [x] 1.3 Verify that `Text` component word-wraps the header list correctly at transcript widths (unit test)

## 2. Overlay rendering — remove safety-net truncation from pre-wrapped paths

- [x] 2.1 `addWrapped`: Remove `truncateToWidth` call — `wrapTextWithAnsi` already guarantees lines ≤ contentWidth
- [x] 2.2 `renderRowDescription`: Remove `truncateToWidth` call — `renderMarkdown` output already ≤ width - 5
- [x] 2.3 `renderReviewAnswer`: Remove `truncateToWidth` call — `renderMarkdown` output already ≤ width - 3
- [x] 2.4 `renderPreviewPane` / `renderPreviewBlock`: Remove `truncateToWidth` calls — `renderMarkdownPreview` output already width-fitted
- [x] 2.5 `renderRows` inline editor continuation lines: Remove `truncateToWidth` — `wrapTextWithAnsi` in `renderInlineEditorLines` already wraps

## 3. Overlay rendering — preserve truncation on non-wrapped paths

- [x] 3.1 Verify separator lines (`─`.repeat(width)) are exact-width and don't need truncation — remove if redundant
- [x] 3.2 Audit tab bar segment truncation — keep if segments can overflow (known issue, out of scope to fix)
- [x] 3.3 Audit `renderOverlay` single-line `add()` calls (section headers, footer) — keep truncation since these are NOT pre-wrapped

## 4. Inline editor rendering

- [x] 4.1 Audit `renderInlineEditorLines` — editor returns raw lines, truncation is needed but verify width math is correct
- [x] 4.2 Audit `renderEditorBlock` and `renderEditorPane` in `ui-rich-render-editor.ts` — editor output is NOT pre-wrapped, keep truncation

## 5. Test updates

- [x] 5.1 Update `render.test.ts` to expect full header list (remove assertion that relied on 60-col truncation)
- [x] 5.2 Add test for long header wrapping in call rendering
- [x] 5.3 Add test for long option label wrapping without truncation in overlay rendering
- [x] 5.4 Run full test suite: `pnpm vitest run packages/supi-ask-user/`

## 6. Verification

- [x] 6.1 Run `pnpm typecheck` on supi-ask-user package
- [x] 6.2 Run `pnpm exec biome check packages/supi-ask-user/`
- [x] 6.3 Manually test with long headers, long option labels, long descriptions, long text answers
- [x] 6.4 Run `pnpm verify` to ensure no regressions across the workspace
