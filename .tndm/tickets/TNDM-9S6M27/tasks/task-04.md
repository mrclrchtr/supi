# Task 4: GREEN: Let current target-oriented code tools consume targetId

# Goal

Make `targetId` useful immediately by allowing current target-oriented `code_*` tools to accept it instead of repeated file/line/character coordinates.

# Files

Create:

- `packages/supi-code-intelligence/src/tool/target-id-params.ts`

Modify:

- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/validation.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-references.ts`
- `packages/supi-code-intelligence/src/tool/execute-calls.ts`
- `packages/supi-code-intelligence/src/tool/execute-implementations.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`
- existing focused tool tests if their schema assertions need updates

# Implementation notes

## Schema updates

Add optional `targetId` to these current public schemas:

- `code_brief`
- `code_references`
- `code_calls`
- `code_implementations`
- `code_affected`
- `code_refactor_plan`

Do not add `targetId` to `code_pattern` or `code_refactor_apply`.

For `code_calls`, allow either `targetId` or anchored `file` + `line` + `character`. The schema can stay flat with optional fields; runtime validation should enforce the rule.

## Shared helper

`src/tool/target-id-params.ts` should export a helper that:

- accepts `{ targetId?: string }` plus existing params
- looks up the target in the workflow target store
- returns either an explicit error string or a merged anchored param object
- maps store entries to current 1-based `file`, `line`, `character` fields
- keeps relative display paths stable for model-facing output where existing executors expect cwd-relative files

If `targetId` is present, it takes precedence over raw `file`, `line`, `character`, and `symbol`.

## Executor updates

Each target-oriented executor should call the helper before existing validation/resolution logic. Unknown or stale target IDs should return explicit error markdown and structured unavailable details where that executor already supports details.

`code_refactor_plan` should support:

```json
{ "targetId": "...", "operation": "rename", "newName": "..." }
```

and use the target ID to supply the file and position.

# Tests

Add/extend tests to cover at least:

- `code_references` with `targetId`
- `code_calls` with `targetId`
- `code_affected` with `targetId`
- `code_refactor_plan` with `targetId`
- unknown `targetId` returns a clear error
- stale `targetId` returns a clear error

# Verification

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts -v
```

Expected result: targetId-based follow-up calls pass and existing coordinate/symbol paths remain green.
