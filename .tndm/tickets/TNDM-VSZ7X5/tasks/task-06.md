# Task 6: Final verification: package tests, typecheck, lint, and full repo verify

## Goal

Confirm the assembled change works end-to-end and does not regress the package or repository verification gates.

## Files

No production files should be edited in this task unless a verification failure exposes a real defect. If a defect is fixed, rerun the failing command and include the fix in the implementation summary.

## Verification commands

Run these commands from the repository root:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence --reporter=verbose
```

Expected result: all `packages/supi-code-intelligence` tests pass, with only pre-existing intentional skips if any remain.

```bash
RTK_DISABLED=1 pnpm exec tsc -b --pretty false \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: no TypeScript errors and no output.

```bash
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
```

Expected result: Biome reports no errors.

```bash
RTK_DISABLED=1 pnpm verify:ai
```

Expected result: repository verification passes.

Manual smoke check after automated verification:

1. Use `code_health` scoped to `packages/supi-code-intelligence` and confirm diagnostics are clean.
2. Use `code_resolve` on `executeGraphTool` in `packages/supi-code-intelligence/src/tool/execute-graph.ts`.
3. Use `code_graph` with the returned `targetId` and `relations: ["tests"]`.
4. Use `code_impact` with the same `targetId` and `includeTests: true`.

Expected manual result: graph/impact output includes `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`; impact output includes a likely test command.

## Test status

Verification task. This is the integration gate for the entire change.
