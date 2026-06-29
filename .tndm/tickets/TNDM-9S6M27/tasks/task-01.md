# Task 1: RED: Lock code_resolve and target-handle behavior in tests

# Goal

Write failing tests for the Phase 1 behavior before implementation.

# Files

Create:

- `packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`

Modify:

- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts`

# Test cases

Add tests that initially fail because implementation is missing:

## Target store tests

In `workflow-target-store.test.ts`, assert the planned target store can:

- register a target and return a `targetId` and `spanId`
- return the same IDs when the same target is registered again with the same file fingerprint
- look up a stored target by `targetId`
- reject an unknown `targetId` with an explicit unavailable/error result
- detect stale entries when the backing file fingerprint changes
- clear all targets for a cwd without clearing unrelated cwd entries

## `code_resolve` tests

In `code-resolve-tool.test.ts`, use the existing `createPiMock`, `getTool`, and `registerMockProvider` patterns to assert:

- `code_resolve` is registered as an active public tool
- missing both `query` and `file` returns a validation error
- `line` or `character` without the other coordinate returns a validation error
- `line` / `character` without `file` returns a validation error
- anchored `{ file, line, character }` resolves to one target with `targetId`, `spanId`, exact file, display position, confidence, and markdown
- file-only `{ file }` resolves exported/discoverable targets and returns target IDs for each shown item
- query-based `{ query, scope?, kind? }` uses semantic workspace symbols and returns either one resolved target or disambiguation candidates with target IDs
- no text-search fallback is used for missing semantic query results

## Registration/surface tests

Update current Phase 0 assertions so:

- `code_resolve` is allowed and expected to be registered
- `code_context`, `code_find`, `code_graph`, `code_impact`, `code_refactor`, `code_apply`, and `code_health` remain unregistered
- current `lsp_*` and `tree_sitter_*` tools remain registered

# Verification

Run the new focused tests and confirm they fail for missing implementation, not for syntax/import errors:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Expected result before GREEN implementation: focused assertions fail because `code_resolve`, target-store exports, and targetId behavior do not exist yet. TypeScript/import failures should be fixed in the RED task itself so the failing signal is behavioral.
