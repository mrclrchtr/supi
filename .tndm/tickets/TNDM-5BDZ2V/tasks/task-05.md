# Task 5: Full verification — typecheck, lint, tests, manual smoke test

## Goal
Confirm the entire change works end-to-end.

## Steps

### 1. Full verification suite
```bash
pnpm verify:ai
```
This runs typecheck, biome lint, and all tests in one pass. Must pass clean.

### 2. Manual smoke test — guidance removal
Call each tool and verify no boilerplate guidance in output:
- `code_resolve` with a symbol query → no "Next steps" block
- `code_resolve` with anchored coords → no "Use targetId with…" one-liner
- `code_graph` with callees → no "Structural analysis…" footer
- `code_graph` with imports → no "Structural analysis…" footer
- `code_find` in text mode → no "Text search…" footer

### 3. Manual smoke test — git context once-per-session
- Call `code_context` with scope-only → verify git context appears
- Call `code_context` with scope-only again → verify git context does NOT appear
- Call `code_health` with `include: ["dirty"]` → verify git context still appears (separate feature)

### 4. Verify no regressions in token count
Compare output lengths for a representative `code_resolve` call before/after. Expect ~120 fewer characters (≈30 fewer tokens).
