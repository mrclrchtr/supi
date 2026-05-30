# Task 2: [TDD GREEN] Register code_context and wire the executor skeleton

# Goal
Make the contract from Task 1 pass by adding the public tool, routing, and executor entrypoint without yet tackling the full context-bundle behavior.

# Files
- `packages/supi-code-intelligence/src/intent/types.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/execute-context.ts` (new)
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts` (only if shared registration wiring needs a small type/support update)

# Change
Implement the additive surface wiring:

1. Add `code_context` to the active tool-name union in `src/intent/types.ts` while keeping `code_brief`.
2. Register `code_context` in `src/tool/tool-specs.ts` using the existing `CodeContextParameters` from `src/workflow/schemas.ts`.
3. Add prompt metadata that frames `code_context` as the task-focused successor to `code_brief`, not as a substrate-level tool.
4. Create `src/tool/execute-context.ts` with the normal entrypoint responsibilities:
   - expand `targetId`
   - validate parameter combinations
   - read provider availability through the planner/runtime
   - delegate to a dedicated use-case hook (a temporary minimal stub is acceptable at the end of this task if it is the smallest step that makes Task 1 green)
5. Route `code_context` in `src/analysis/routing/planner.ts` with the same semantic/structural preference model as `code_brief`.

Keep the implementation minimal: this task is about public-surface activation and correct wiring, not the rich bundle content yet.

# Verification
Re-run the Task 1 command and make it pass. Then confirm the package still typechecks:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts -v

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json -v
```

Expected result: the contract/routing tests from Task 1 pass, and TypeScript stays clean.

# Test strategy
This is the GREEN step for Task 1. Do not broaden behavior beyond what the failing tests require.
