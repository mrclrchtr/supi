# Task 1: [TDD RED] Lock the code_context public contract, registration, and routing

# Goal
Write the failing tests that define the additive `code_context` surface before any implementation work starts.

# Files
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` (new)

# Change
Add failing coverage for the new public contract:

1. `code_context` is registered as a public tool while `code_brief` remains registered.
2. The tool schema exposes the existing workflow fields: `task`, `targetId`, `scope`, `budget`, `include`, and `maxResults`.
3. `code_context` is no longer treated as an inactive/planned-only workflow tool in extension-registration assertions.
4. Planner routing treats `code_context` like the current orientation path: semantic-preferred when semantic is available, structural-preferred when only structural is available, unavailable when neither substrate is available.
5. A focused tool test proves the registered tool exists and rejects the current missing implementation state for the right reason.

Keep the new test file small and targeted instead of expanding the already-large registration/routing files too far.

# Verification
Run the new focused test set and confirm it fails because `code_context` is not implemented/registered yet:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts -v
```

Expected result: failing assertions that specifically point to the missing `code_context` tool/route, not unrelated breakage.

# Test strategy
TDD required. Do not start tool wiring until these failures are observed.
