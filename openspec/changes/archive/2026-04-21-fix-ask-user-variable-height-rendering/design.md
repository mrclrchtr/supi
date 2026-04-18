## Context

The ask-user rich overlay renders as a child of pi's `editorContainer` (replacing the editor during tool execution). Pi-tui's `TUI` class uses differential rendering — comparing `newLines` with `previousLines` and only re-rendering changed regions. Viewport tracking (`previousViewportTop`) assumes the terminal only scrolls down (on content growth) but recalculates as if the terminal scrolls back up on content shrinkage. Terminals don't scroll up — they leave the viewport in place with empty space at the bottom.

The ask-user component's `renderOverlay()` produces variable line counts because:
- `renderPreviewBlock()` adds preview lines only for the selected option (different options have different preview lengths, some have none)
- In split-view mode, `Math.max(leftLines.length, rightLines.length)` varies per selection
- Inline editor states (Other/Discuss) change row counts

When total content (chat messages + ask-user + footer) oscillates around the terminal height, the viewport tracking drifts, and cursor positioning becomes incorrect.

## Goals / Non-Goals

**Goals:**
- Eliminate visual corruption when navigating options with varying preview sizes
- Fix the cosmetic double "(recommended)" decoration
- Keep the fix minimal and contained to the ask-user extension (no pi-tui changes)

**Non-Goals:**
- Fixing the upstream pi-tui viewport tracking bug (file an issue instead)
- Changing the ask-user component from editor-replacement to overlay mode (viable future improvement but larger scope)
- Changing the visual design of preview rendering

## Decisions

### Decision 1: Track max height and pad — don't pre-compute

**Choice:** Track `maxHeight` in `OverlayState`, update it after each render, and pad with empty lines when the current render is shorter.

**Alternatives considered:**
- *Pre-compute max preview height across all options*: Requires traversing all options and measuring their preview content before first render. Fragile — doesn't account for editor-mode height changes, note rendering, or wrap differences. Would need to be re-computed on width changes.
- *Use overlay mode*: Architecturally cleaner (overlays pad to `termHeight` internally), but changes the integration surface, visual presentation, and focus/input handling. Better as a separate future change.
- *Force full re-render via `clearOnShrink`*: Not settable from extension code; even if it were, it's disabled when any overlay is on the stack.

**Rationale:** Max-height tracking is a 5-line change in the render callback. It handles all sources of height variation (preview, editor, notes, split vs. standard) without needing to predict them. The only trade-off — empty lines below the footer separator when navigating from a tall to short preview — is visually negligible.

### Decision 2: Reset maxHeight on question change

**Choice:** Reset `maxHeight` to 0 in `resetStateForCurrent()` when navigating to a new question in a multi-question flow.

**Rationale:** Different questions have different base heights (different option counts, descriptions, previews). Carrying a tall question's max into a short question would waste excessive screen space. Resetting per question keeps padding tight.

### Decision 3: Guard decorateOption with string check

**Choice:** Check if the label already ends with "(recommended)" before appending.

**Rationale:** Simple, non-breaking. The agent controls the label text and sometimes includes the decoration. A case-insensitive suffix check prevents doubling without removing the extension's own decoration logic.

## Risks / Trade-offs

- **[Empty lines at bottom]** → Visually minor; lines appear below the closing separator. The height only grows within a question, never shrinks, so it stabilizes after the user visits the tallest option. Acceptable trade-off vs. visual corruption.
- **[maxHeight not reset on width change]** → Width changes already clear `cachedLines` and `cachedWidth`. The `maxHeight` should also reset since line counts change with width (wrapping, split vs. standard threshold at width 100). Mitigated by resetting `maxHeight` alongside `cachedWidth`.
- **[Upstream TUI bug remains]** → Other extensions with variable-height editor-replacement components could hit the same bug. File a pi-tui issue for the proper fix.
