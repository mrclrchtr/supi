# Task 2: [TDD GREEN] Replace public tool specs, guidance, and routing with the new surface

## Goal

Make the public registration and routing tests pass with the new clean-break tool surface.

## Files

- `packages/supi-code-intelligence/src/intent/types.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/guidance.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts`
- `packages/supi-code-intelligence/src/tool/families/code/specs.ts`
- `packages/supi-code-intelligence/src/tool/families/code/register.ts`
- `packages/supi-code-intelligence/src/tool/families/code/execute.ts`
- `packages/supi-code-intelligence/src/tool/families/code/guidance.ts`
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts`
- `packages/supi-code-intelligence/src/planner/planner.ts`
- `packages/supi-code-intelligence/src/code-intelligence.ts` if registration imports need renaming
- `packages/supi-code-intelligence/src/types.ts`

## Changes

- Replace canonical tool names with:
  - `code_brief`
  - `code_map`
  - `code_references`
  - `code_calls`
  - `code_implementations`
  - `code_affected`
  - `code_pattern`
  - `code_refactor_plan`
  - `code_refactor_apply`
- Remove public `CODE_RELATION_KIND_NAMES` usage from the high-level tool specs.
- Add schemas for each new tool.
- Update prompt guidance to use references/usages wording and outgoing-call wording.
- Update routing so each tool has explicit capability expectations.
- Update the code tool family re-export surfaces so tests and consumers resolve the new executors.
- Modify the tool registration context shape so executors can receive `cwd` plus enough `ExtensionContext` access for refactor apply in later tasks.

## Verification

Run the RED tests from Task 1 and confirm they pass or fail only where deeper executors are not yet implemented:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```

Also run a typecheck for the package after the public specs compile:

```bash
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

## TDD status

GREEN task for Task 1.
