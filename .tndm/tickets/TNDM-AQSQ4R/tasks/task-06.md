# Task 6: Final verification — full code-context package sweep and live smoke

# Goal
Confirm the assembled `code_context` change works end-to-end and that the package still verifies cleanly.

# Files
- Whole package scope: `packages/supi-code-intelligence/**`

# Change
Do not add new product code in this task. Use it as the integration gate for the completed implementation.

# Verification
Run the full package sweep:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json -v

pnpm exec biome check packages/supi-code-intelligence
```

Then run a live smoke in PI after `/reload` (or a restart if needed because extensions load from the working tree directly):

1. `code_resolve` a known symbol such as `executeBriefTool`.
2. Call `code_context` with the returned `targetId`, a concrete task string, and a narrow `include` list.
3. Confirm the result is task-focused, preserves the target identity, and handles missing sections honestly.
4. Confirm `code_brief` still works as the compatibility/orientation tool.

Expected result:
- package tests pass
- TypeScript build stays clean
- Biome stays clean
- live PI smoke confirms both `code_context` and `code_brief` behave as intended

# Test strategy
This is the mandatory final verification task for the whole change.
