## Context

`supi-ask-user` renders content in two contexts: the in-session transcript (via `renderCall`/`renderResult`) and the rich overlay UI (via `ui-rich-render.ts`). Both currently apply `truncateToWidth` in patterns that can silently cut user-visible critical content:

1. **Call header** (`render.ts`): `MAX_HEADER_LIST = 60` hard-caps the comma-separated question header list displayed in the transcript. Pi's `Text` component already word-wraps its render output, so this cap is unnecessary — it only causes information loss.

2. **Overlay safety nets** (`ui-rich-render.ts`): Every rendered line passes through `truncateToWidth(text, env.width)` regardless of whether the text was already width-fitted. Pre-wrapped text (via `addWrapped`→`wrapTextWithAnsi`, or `Markdown.render()`) should never need a secondary truncation pass.

3. **Editor rendering** (`ui-rich-inline.ts`, `ui-rich-render-editor.ts`): Inline editor lines for Other/Discuss input and separate editor panes truncate rendered lines. Since editors control their own width, truncation here masks layout bugs rather than preventing overflow.

The rendering stack already has three width-fitting mechanisms that make `truncateToWidth` safety nets redundant:
- `Text.render(width)` — word-wraps at given width
- `Markdown.render(width)` — wraps at given width (code blocks, tables, etc.)
- `wrapTextWithAnsi(text, width)` — wraps at given width preserving ANSI codes

All overlay content flows through one of these before hitting `truncateToWidth`, except for:
- Separator lines (`─`.repeat(width)) — already exact width
- Tab bar segments — constructed to fit, no wrapping
- Editor captions — single-line, width ≤ available
- Review header lines (` ${question.header}:`) — headers ≤ 40 chars, negligible

## Goals / Non-Goals

**Goals:**
- Remove the 60-col hard cap from `renderAskUserCall` so the full header list appears in the transcript
- Remove `truncateToWidth` safety nets where text is already pre-wrapped
- Verify no content regression — option labels, descriptions, previews, review answers all render correctly

**Non-Goals:**
- Changing the overlay layout algorithm
- Changing option label/description wrapping behavior
- Adding scroll support for overflow content
- Modifying `formatSummaryBody`/`formatReviewLines` output format
- Touching the model-facing `result.content[0].text` (already unlimited)

## Decisions

### D1: Remove `truncateToWidth` from pre-wrapped paths; keep on non-wrapped paths

**Chosen:** Remove `truncateToWidth` from `addWrapped`, `renderRowDescription`, `renderReviewAnswer`, `renderPreviewPane`, `renderPreviewBlock`, and `renderRows` (inline editor lines that have been wrapped). Keep it on separator lines, tab bar segments, and editor captions where text is NOT pre-wrapped.

**Rationale:** Pre-wrapped text already fits within `env.width`. A secondary `truncateToWidth` call serves only as a bug-masker — if wrapping produces overflow, it's a wrapping bug that should be fixed at the source, not silently covered.

**Alternative:** Keep all safety nets and raise the max width. Rejected — doesn't fix the root issue (redundant double-truncation), just moves the threshold.

### D2: Drop `MAX_HEADER_LIST` entirely; rely on `Text` word-wrap

**Chosen:** Remove the `MAX_HEADER_LIST` constant and `truncateToWidth` call. The `Text` component returned by `renderAskUserCall` already word-wraps via `render(width)`. The full header list will display across multiple lines if needed.

**Rationale:** Information loss in the transcript call header is the primary user-facing truncation concern. The transcript renderer calls `.render(width)` with the actual available width, so the component naturally adapts.

**Alternative:** Raise `MAX_HEADER_LIST` to something generous (e.g., 200). Rejected — any cap is arbitrary and risks truncation for edge cases (long headers + 4 questions).

### D3: Inline editor truncation: keep but audit width math

**Chosen:** Keep `truncateToWidth` in `renderInlineEditorLines` (editor output is not pre-wrapped for width) but audit the width calculation to ensure it's correct.

**Rationale:** Editor lines are NOT pre-wrapped by `wrapTextWithAnsi` — the editor's `getLines()` returns raw text lines. `truncateToWidth` here guards against the editor returning lines wider than the available space. However, the editor itself renders within the allocated width, so overflow should be impossible if width math is correct.

## Risks / Trade-offs

- **Wider overlay height**: Removing `truncateToWidth` safety nets means long content will wrap to more lines if the wrapping math was previously compensating. → Mitigation: Verify overlay rendering tests pass with realistic content widths.
- **Tab bar overflow**: If question headers are all at the 40-char max, the tab bar could overflow on narrow terminals. → Mitigation: This is a pre-existing issue (tab bar is truncated). Not in scope for this change.
- **Edge-case ANSI width miscalculation**: If `wrapTextWithAnsi` or `Markdown.render()` miscalculates width for certain ANSI sequences, removing the safety net means output could exceed `env.width`. → Mitigation: This would be a pi-tui bug, not a supi bug. The safety net hides it; removing it exposes it so it can be fixed upstream.

## Open Questions

None.
