## 1. Stabilize render height

- [x] 1.1 Add `maxHeight: number` field to `OverlayState` in `ui-rich-state.ts`, initialized to `0`
- [x] 1.2 In `buildOverlay` render callback (`ui-rich.ts`), after generating lines: update `maxHeight` if current length exceeds it, then pad with empty strings to reach `maxHeight`
- [x] 1.3 Reset `maxHeight` to `0` in `resetStateForCurrent()` (`ui-rich-state.ts`) so each question starts fresh
- [x] 1.4 Reset `maxHeight` to `0` alongside `cachedWidth` when terminal width changes in the render callback

## 2. Fix double "(recommended)" decoration

- [x] 2.1 In `decorateOption()` (`format.ts`), check if the label already ends with `(recommended)` (case-insensitive, trimmed) before appending

## 3. Tests

- [x] 3.1 Add unit test: `renderOverlay` output length does not decrease when navigating from an option with a long preview to one with no preview
- [x] 3.2 Add unit test: `renderOverlay` output length increases when navigating to an option with a longer preview
- [x] 3.3 Add unit test: `maxHeight` resets when `resetStateForCurrent()` is called (simulating question change)
- [x] 3.4 Add unit test: `decorateOption("Two commits (recommended)", true)` returns label without double decoration
- [x] 3.5 Add unit test: `decorateOption("Two commits", true)` still appends `(recommended)` normally

## 4. Verification

- [x] 4.1 Run `pnpm verify` — all checks pass
- [x] 4.2 Run `pnpm exec biome check --write` on all changed files
