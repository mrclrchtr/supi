# Task 4: End-to-end verification: tests, types, lint, smoke test

## Goal
Confirm the complete change works correctly across all layers.

## Steps

### 1. Full test suite
```bash
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts
```
All tests must PASS.

### 2. TypeScript compilation
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```
No type errors.

### 3. Lint
```bash
pnpm exec biome check packages/supi-code-intelligence/src/ui/code-intelligence-status-overlay.ts packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts
```
No lint errors. Auto-fix if needed with `--write --unsafe`.

### 4. Regression check
```bash
pnpm vitest run packages/supi-code-intelligence/
```
All existing supi-code-intelligence tests still PASS. No new failures.

### 5. Manual smoke test (in pi)
- Start pi, open a project with LSP (e.g., supi workspace itself)
- Run `/ci-status` — dialog appears centered, shows servers and diagnostics
- Press ↓ to navigate file rows, Enter to expand/collapse
- Press Esc — dialog closes, status bar and widget update
- Run `/ci-status` again — opens fresh
- Verify status bar appears in footer
- Verify widget appears below editor when diagnostics exist
- In a project with no LSP, run `/ci-status` — shows "no LSP session" message

## Verification
All automated tests pass, no type errors, no lint errors, manual smoke test confirms overlay renders and interacts correctly.
