# Task 3: GREEN: Register code_resolve and render resolve results

# Goal

Expose `code_resolve` as the first active V2 workflow tool while leaving the rest of the public surface unchanged.

# Files

Create:

- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts`
- `packages/supi-code-intelligence/src/tool/execute-resolve.ts`

Modify:

- `packages/supi-code-intelligence/src/intent/types.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/guidance.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts`

# Implementation notes

## Public spec

Add `code_resolve` to the current registered code-intelligence tool list. Reuse the Phase 0 `CodeResolveParameters` schema from `src/workflow/schemas.ts` instead of duplicating the schema literals.

Add guidance that says:

- use `code_resolve` when a symbol/file/reference is ambiguous
- prefer follow-up tools with returned `targetId`
- `code_resolve` does not mutate files
- `code_resolve` does not do text-search fallback for semantic symbol resolution

## Executor

`src/tool/execute-resolve.ts` should:

- call the resolve service
- render compact markdown through `presentation/markdown/resolve.ts`
- return `CodeIntelResult` with `details.type === "resolve"`

## Renderer

`src/presentation/markdown/resolve.ts` should render:

- resolved targets with target ID, span ID, file, line/character, symbol/kind, confidence, and provenance
- file-level groups as a short list capped by `maxResults`
- disambiguation results with target IDs for every shown candidate
- error states with actionable next queries
- examples of follow-up current tools using `targetId`

Keep output concise; do not dump raw provider data.

## Tests

Update Phase 0 tests so only the remaining planned tools are not registered. `code_resolve` should now be both:

- present in `WORKFLOW_CODE_TOOL_NAMES`
- registered in the current public tool surface

# Verification

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Expected result: all focused `code_resolve`, registration, and workflow-surface tests pass.
