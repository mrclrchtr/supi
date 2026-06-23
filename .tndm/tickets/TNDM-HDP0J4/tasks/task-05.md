# Task 5: Delete old execute-references, execute-calls, execute-implementations

## Goal
Delete the three old executor modules. Their logic is subsumed by `execute-graph.ts`.

## Files to delete
- `packages/supi-code-intelligence/src/tool/execute-references.ts`
- `packages/supi-code-intelligence/src/tool/execute-calls.ts`
- `packages/supi-code-intelligence/src/tool/execute-implementations.ts`

## Pre-check
Before deleting, confirm no other code imports from these files (task 4 should have removed the only import — tool-specs.ts).

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` — no import errors from deleted files
- `rg "execute-references|execute-calls|execute-implementations" packages/supi-code-intelligence/src/` — no remaining references in source (test references are OK, handled in task 7)
