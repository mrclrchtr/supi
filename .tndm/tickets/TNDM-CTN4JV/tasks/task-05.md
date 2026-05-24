# Task 5: Wire substrates through tool executors

Update each tool executor to create substrates and thread them into actions. The executors are the composition root — they own acquisition.

**`execute-brief.ts`**: Create `StructuralSubstrate` via `createStructuralSubstrate(cwd)` and pass to `executeBriefAction()`. Also pass to `addTreeSitterContext()` and helpers. No semantic substrate needed for brief.

**`execute-relations.ts`**: Based on `kind`, create `SemanticSubstrate` (for `callers`, `implementations`) or `StructuralSubstrate` (for `callees`). Pass the appropriate substrate to each action. The `tool-specs.ts` run wrapper needs updating to accept the substrate param.

**`execute-affected.ts`**: Create `SemanticSubstrate` and pass to `executeAffectedAction()`.

**`execute-pattern.ts`**: When `kind` is present (structured), create `StructuralSubstrate` and pass to `getStructuredPatternMatches()`. When no `kind` (ripgrep path), no substrate needed.

Each executor imports `createSemanticSubstrate` / `createStructuralSubstrate` from the adapters instead of the old providers.

Run `pnpm vitest run packages/supi-code-intelligence/` — some action tests will fail because action signatures changed (addressed in task 6). The executor-level unit tests should be updated in this task.
