# Task 5: Final verification and phase handoff

# Goal

Verify the complete Phase 0 skeleton, prepare a review summary, and stop for user review before any next phase begins.

# Files

No source changes should be made in this task unless verification reveals a small fix required for Phase 0 correctness.

# Verification commands

Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
rg "WORKFLOW_CODE_TOOL_NAMES|code_resolve|code_health" packages/supi-code-intelligence/src/workflow packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Expected result:

- package test suite passes
- package source and test typecheck passes
- Biome reports no new issues beyond accepted existing baseline, if any
- grep confirms the skeleton and docs are present

# Review handoff

Prepare a concise summary for the user covering:

- files created/modified
- confirmed no runtime public tool registration changes
- verification command results
- recommended next phase ticket, likely `code_resolve` handles

Stop after the handoff. The user should review and commit Phase 0 before a future phase starts.
