# Task 3: [TDD RED] Define task-focused code_context bundle behavior and metadata

# Goal
Codify the real `code_context` behavior before implementing it: orientation fallback, task-focused sections, section filtering, and structured details.

# Files
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` (only if active follow-up suggestion wording changes)

# Change
Add failing tests that lock the intended behavior:

1. Calling `code_context` without `task` produces orientation-style output instead of an error.
2. Calling `code_context` with `task` + a precise target (`targetId` or anchored coordinates) produces a task-focused bundle that clearly separates the lead context from follow-up sections.
3. `include` filters the result so only requested sections render.
4. Requested-but-empty or unavailable sections are called out honestly rather than silently omitted or fabricated.
5. `budget` / `maxResults` cap repeated sections deterministically.
6. Tool details use a dedicated context metadata shape instead of reusing the old `brief` metadata bucket.
7. If `code_resolve` follow-up suggestions now mention `code_context`, replace the old test that forbids unregistered `code_context` wording with the new active-surface expectation.

Keep the tests narrow and behavioral. Use the existing mock-runtime/provider patterns from other code-intelligence tests instead of inventing new harnesses.

# Verification
Run the focused behavior tests and confirm they fail for the missing context-orchestration behavior:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
```

Expected result: failures point to missing/incorrect `code_context` output or metadata, not registration/routing.

# Test strategy
TDD required. Do not implement the bundle/orchestration work until these failures are observed.
