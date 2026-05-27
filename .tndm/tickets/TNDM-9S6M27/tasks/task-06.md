# Task 6: Final verification and Phase 1 handoff

# Goal

Verify the full Phase 1 change end-to-end and record evidence for handoff/archive.

# Files

No implementation files should be edited in this task unless verification exposes a defect. If defects are found, fix them in the smallest relevant source/test/doc files and rerun the checks.

# Verification commands

Run focused tests:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Run package tests:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
```

Run typecheck:

```bash
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

Run Biome baseline check:

```bash
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
```

Run stale-reference checks:

```bash
rg -n "code_resolve|targetId" packages/supi-code-intelligence/src packages/supi-code-intelligence/__tests__ packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
rg -n "does not register planned V2 workflow tools|Phase 0 does not register" packages/supi-code-intelligence/src packages/supi-code-intelligence/__tests__ packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Expected result:

- focused tests pass
- package tests pass or only explicitly skipped tests remain skipped
- typecheck passes with no output/errors
- Biome shows only the accepted pre-existing baseline, or is clean
- stale-reference check confirms docs/tests no longer claim all V2 workflow tools are unregistered in Phase 1

# Handoff evidence

Capture a short summary of:

- active public `code_resolve` behavior
- targetId follow-up coverage
- unchanged public substrate tool registration
- verification command results
- recommended next phase: `code_context` and `code_find` or a smaller bridge phase if Phase 1 discovers targetId gaps
