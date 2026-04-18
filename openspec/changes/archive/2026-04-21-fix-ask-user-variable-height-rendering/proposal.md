## Why

The ask-user rich overlay produces variable-height output when navigating between options with different preview lengths (or between options with/without previews). This triggers a viewport tracking bug in pi-tui's differential renderer: when content grows past the terminal height (causing scroll) and then shrinks back, `previousViewportTop` resets to 0 while the terminal's actual viewport stays scrolled. Subsequent cursor positioning is off, causing ghost lines, duplicated options, and overlapping content.

A secondary cosmetic issue exists: `decorateOption()` unconditionally appends "(recommended)" to recommended option labels, but agents sometimes include "(recommended)" in the label text itself, producing doubled decoration.

## What Changes

- **Stabilize component render height**: track the maximum line count across renders and pad shorter renders with empty lines, preventing the grow→shrink cycle that triggers the TUI viewport bug.
- **Strip duplicate "(recommended)" decoration**: detect when the option label already contains the decoration text before appending it.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `ask-user`: add a rendering stability requirement — the rich overlay SHALL produce consistent line counts across re-renders within the same question to avoid differential rendering artifacts.

## Impact

- `packages/supi-ask-user/ui-rich.ts` — add `maxHeight` to overlay state; pad render output
- `packages/supi-ask-user/ui-rich-state.ts` — extend `OverlayState` with `maxHeight` field; reset on question change
- `packages/supi-ask-user/format.ts` — guard `decorateOption()` against double decoration
- `packages/supi-ask-user/__tests__/` — add test coverage for height stability and decoration dedup
