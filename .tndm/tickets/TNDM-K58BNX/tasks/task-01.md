# Task 1: RED: codify the `code_inspect` contract and the orientation-only `code_brief` split

# Goal
Write failing tests that lock the new public contract before changing implementation.

# Files
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts` (new)
- `packages/supi-code-intelligence/__tests__/unit/presentation/inspect.test.ts` (new)
- `packages/supi-code-intelligence/__tests__/unit/presentation/anchored-brief.test.ts` (remove after coverage is migrated)
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts`
- `packages/supi-code-intelligence/__tests__/helpers/execute-action.ts` (only if the new inspect assertions need the legacy test shim)

# Change
1. Add registration/schema assertions that require a public `code_inspect` tool and require `code_brief` to stop exposing `line` and `character`.
2. Add routing assertions for `code_inspect` in `planner-routing.test.ts`.
3. Create `code-inspect-tool.test.ts` that expects:
   - required `file` + `line` + `character`
   - best-effort sections for node, enclosing symbol, hover, definition, nearby diagnostics, and code actions
   - explicit unavailable sections when providers are missing
4. Replace anchored renderer coverage with `presentation/inspect.test.ts`, including unavailable-section rendering.
5. Update `details-metadata.test.ts` so inspect returns structured `{ type: "inspect" }` details and `code_brief` no longer behaves like anchored inspection.
6. Update `review-fixes.test.ts` so `code_brief({ symbol: ... })` remains useful but becomes orientation-only rather than inspect-like.
7. Update any follow-up-string assertions in impact/relations tests so point-specific guidance is expected to move to `code_inspect`.

# Verification
Run this command and confirm it fails for the new contract, not for syntax errors:

```bash
RTK_DISABLED=1 pnpm vitest run -v \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/presentation/inspect.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts
```

Expected result: non-zero exit with failures showing missing `code_inspect`, stale anchored `code_brief` schema/behavior, or stale follow-up guidance strings.

# Test mode
Test-driven (RED).
