# Task 4: [TDD GREEN] Implement references, calls, implementations, and shared affected reference evidence

## Goal

Implement the corrected relation semantics and make the Task 3 behavior tests pass.

## Files

- `packages/supi-code-intelligence/src/tool/execute-references.ts`
- `packages/supi-code-intelligence/src/tool/execute-calls.ts`
- `packages/supi-code-intelligence/src/tool/execute-implementations.ts`
- `packages/supi-code-intelligence/src/analysis/references/service.ts`
- `packages/supi-code-intelligence/src/analysis/calls/service.ts`
- `packages/supi-code-intelligence/src/analysis/implementations/service.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/references.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/calls.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/implementations.ts`
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/types.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`, `packages/supi-code-intelligence/src/use-case/generate-relations.ts`, `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`, and `packages/supi-code-intelligence/src/analysis/relations/*` if cleanup or migration is needed after the new services exist

## Changes

- Implement target resolution for `code_references` and `code_implementations` using existing anchored/symbol helpers.
- Implement `code_references` over LSP references with accurate references/usages language.
- Implement `code_calls` over structural `calleesAt` with outgoing-call-only language.
- Implement `code_implementations` over LSP implementation lookup.
- Share canonical reference collection between `code_references` and `code_affected`.
- Ensure no semantic relation tool falls back to `code_pattern` or ripgrep.
- Remove or isolate obsolete relation code so misleading caller semantics are no longer public.

## Verification

Run the tests from Task 3 and confirm they pass:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/references-tool.test.ts packages/supi-code-intelligence/__tests__/unit/calls-tool.test.ts packages/supi-code-intelligence/__tests__/unit/implementations-tool.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts -v
```

Run package typecheck after moving or deleting relation modules:

```bash
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

## TDD status

GREEN task for Task 3.
