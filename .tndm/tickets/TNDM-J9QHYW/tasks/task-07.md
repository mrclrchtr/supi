# Task 7: Update docs, package guidance, and stale references to old relation/refactor names

## Goal

Bring user-facing docs, package-local guidance, and tests into alignment with the new public surface.

## Files

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/src/tool/guidance.ts`
- `packages/supi-code-intelligence/src/lsp/guidance.ts` if expert fallback text mentions old high-level refactor flow
- `packages/supi-code-intelligence/src/tree-sitter/guidance.ts` if fallback guidance mentions old relation flow
- Any `packages/supi-code-intelligence/__tests__/**/*.ts` file still asserting old `code_relations` or `code_refactor` behavior

## Changes

- Update README tool list and examples:
  - replace `code_relations` with `code_references`, `code_calls`, and `code_implementations`;
  - replace direct `code_refactor` with `code_refactor_plan` and `code_refactor_apply`;
  - document that `code_calls` v1 is outgoing structural calls only.
- Update package CLAUDE notes:
  - public contracts;
  - planner/capability notes;
  - refactor safety and stale-plan behavior;
  - no-heuristic policy.
- Search for old high-level wording and remove misleading `callers` guidance unless it explicitly refers to deprecated historical behavior or lower-level substrate limitations.

## Verification

Run a focused stale-reference scan:

```bash
rg "code_relations|code_refactor|kind: \"callers\"|Callers of" packages/supi-code-intelligence
```

Expected result: no stale user-facing references to removed public tools. Test fixtures may contain old strings only when they intentionally verify absence or migration behavior.

Run docs/test lint for touched files:

```bash
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20
```

## TDD status

Test-exempt for prose/documentation alignment. Manual verification is the `rg` scan plus Biome check above.
