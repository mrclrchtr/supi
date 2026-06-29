# Task 2: [TDD GREEN] Add shared operation-aware refactor request types and LSP operation selection

# Task 2: [TDD GREEN] Add shared operation-aware refactor request types and LSP operation selection

## Goal

Teach the shared semantic-provider layer how to plan the first-wave refactor operations without pushing substrate-specific branching into the tool executor.

## Files

- `packages/supi-code-runtime/src/types.ts`
- `packages/supi-code-runtime/src/capability/types.ts`
- `packages/supi-code-runtime/src/api.ts`
- `packages/supi-code-runtime/src/index.ts` (if the export surface changes)
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`
- `packages/supi-lsp/src/session/service-registry.ts` (only if extra code-action filtering or range support is required)
- `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts`
- `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts` (only if interface changes ripple here)

## Changes

1. Add shared refactor operation/request metadata so the provider can receive an operation-aware planning request instead of a rename-only call shape.
2. Keep the result contract precise/unavailable/ambiguous — do not add heuristic result states.
3. In `createLspSemanticProvider()` map operations as follows:
   - `rename_symbol` (and legacy `rename`) → existing `textDocument/rename`
   - `update_imports` → precise organize-imports/source-action code actions only
   - `delete_dead_code` → precise quickfix/refactor-rewrite/source-fix code actions only
   - `rename_file` / `move_file` → explicit unavailable for this ticket
4. Reject code actions that do not produce precise edits.
5. Keep the provider contract honest: if the LSP substrate cannot produce a precise edit for a requested operation, return explicit unavailable.

## Verification

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/refactor-provider.test.ts -v
pnpm exec tsc -b \
  packages/supi-code-runtime/tsconfig.json \
  packages/supi-code-runtime/__tests__/tsconfig.json \
  packages/supi-lsp/tsconfig.json \
  packages/supi-lsp/__tests__/tsconfig.json
```

Expected result: targeted refactor-provider tests pass and both packages typecheck cleanly.
