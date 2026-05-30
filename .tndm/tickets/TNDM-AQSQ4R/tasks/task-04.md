# Task 4: [TDD GREEN] Implement code_context orchestration, rendering, and honest section handling

# Goal
Make the behavioral tests from Task 3 pass with the smallest truthful `code_context` implementation that composes existing code-intelligence capabilities.

# Files
- `packages/supi-code-intelligence/src/use-case/types.ts`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` (new)
- `packages/supi-code-intelligence/src/presentation/markdown/context.ts` (new)
- `packages/supi-code-intelligence/src/types.ts`
- `packages/supi-code-intelligence/src/tool/execute-context.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` (if active follow-up suggestions should now reference `code_context`)
- Any already-existing internal analysis/helper file only when needed to reuse current evidence cleanly instead of duplicating logic

# Change
Implement `code_context` as a task-focused orchestration layer over the current stack:

1. Add typed input/dependency/result contracts for the context use-case.
2. Build `generate-context.ts` so it can:
   - reuse current orientation/brief data when `task` is omitted
   - accept precise targets via `targetId` / anchored coordinates / scoped symbol inputs
   - collect best-effort definitions/imports/exports from the existing brief/enrichment path
   - collect references and callees from the existing relation services instead of re-querying through public tool adapters
   - include diagnostics when requested using the existing provider/health evidence already available in-package
   - use explicit search/evidence only where it is appropriate for docs/tests sections
3. Honor `include`, `budget`, and `maxResults` deterministically.
4. Render unavailable or empty requested sections honestly; do not invent content.
5. Return a dedicated context details payload from `src/types.ts` and thread it through the executor.
6. Keep `code_brief` registered and unchanged as the compatibility/orientation tool in this phase.

Prefer the simplest composition that passes the tests. Avoid introducing another mega-tool abstraction or new provider contracts.

# Verification
Re-run the Task 3 command until it passes. Then do a focused live smoke inside PI after `/reload`:

1. Resolve a known symbol, for example `executeBriefTool`, with `code_resolve`.
2. Run `code_context` with the returned `targetId`, a concrete task string, and a narrow `include` list.
3. Confirm the result is task-focused, uses the target cleanly, and reports any unavailable sections explicitly.

Suggested automated check:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
```

Expected result: focused behavior tests pass and the manual smoke shows a real task-focused bundle.

# Test strategy
This is the GREEN step for Task 3. Reuse existing services and helpers; do not bypass the failing tests with hard-coded output.
