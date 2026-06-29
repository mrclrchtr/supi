# Task 6: Final verification and smoke test

## Goal

Prove the assembled change works end-to-end and does not regress the package or workspace.

## Files

No planned source edits in this task. This task verifies all changes from Tasks 1–5.

## Verification commands

Run these commands in order:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
RTK_DISABLED=1 pnpm exec tsc -b --pretty false packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
RTK_DISABLED=1 pnpm verify:ai
git diff --check
```

Expected result: all commands exit 0.

## Manual smoke test

Use the live tools on this repository after implementation:

1. Resolve `executeFindTool`:

```text
code_resolve({ query: "executeFindTool", scope: "packages/supi-code-intelligence", kind: "function", maxResults: 5 })
```

2. Use the returned `targetId` with:

```text
code_graph({ targetId, relations: ["references", "tests"], maxResults: 8 })
code_context({ task: "find related tests", targetId, include: ["references", "tests"], budget: "medium", maxResults: 8 })
code_impact({ targetId, includeTests: true, maxResults: 8 })
```

Expected smoke-test result:

- references do not display duplicate same-line entries
- tests include `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` when applicable
- impact either shows the likely test or explicitly reports no bounded likely tests found

## Completion evidence

Record command outcomes and smoke-test observations before marking this task done.
