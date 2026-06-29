# Task 8: Final verification for the redesigned code-intelligence relation/refactor surface

## Goal

Confirm the assembled change works end-to-end after all implementation and docs tasks are complete.

## Files

- No source files should be changed in this task unless verification exposes a defect. If a defect is found, fix it in the smallest affected implementation or test file and rerun the relevant checks.

## Verification commands

Run targeted package tests:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
```

Run package typecheck:

```bash
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

Run package lint/format check:

```bash
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20
```

Run stale public-surface scan:

```bash
rg "code_relations|code_refactor|kind: \"callers\"|Callers of" packages/supi-code-intelligence
```

Expected scan result: only intentional historical/migration assertions remain, if any; no user-facing docs or prompt guidance advertise removed public tools.

Manual smoke behavior to exercise in tests or with a local pi session if practical:

- `code_references` reports references/usages, not callers.
- `code_calls` reports outgoing structural calls only.
- `code_refactor_plan` previews a rename without changing files.
- `code_refactor_apply` applies a valid plan and rejects a stale plan.

## TDD status

Final integration verification task. It is test-exempt because it verifies the completed plan rather than adding new behavior.
