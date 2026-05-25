# Task 1: Reintroduce `packages/supi-code-runtime/` as the shared library-only runtime layer

## Goal
Create a new library-only package that owns the shared code-understanding contracts and workspace runtime used by `supi-lsp`, `supi-tree-sitter`, and `supi-code-intelligence`.

## Files
Create:
- `packages/supi-code-runtime/package.json`
- `packages/supi-code-runtime/README.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-code-runtime/tsconfig.json`
- `packages/supi-code-runtime/__tests__/tsconfig.json`
- `packages/supi-code-runtime/src/api.ts`
- `packages/supi-code-runtime/src/index.ts`
- `packages/supi-code-runtime/src/types.ts`
- `packages/supi-code-runtime/src/capability/types.ts`
- `packages/supi-code-runtime/src/workspace/runtime.ts`
- `packages/supi-code-runtime/src/workspace/context.ts`
- `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts`
- `packages/supi-code-runtime/__tests__/unit/workspace-context.test.ts`

## Change
Follow the package-layout convention for a library-only package.

Move the canonical shared value/result shapes and capability interfaces out of `packages/supi-code-intelligence/src/**` into the new package. The new runtime package should expose:
- shared value/result types
- capability interfaces for semantic, structural, diagnostics, and availability state
- a workspace-scoped registry keyed by cwd/project root
- a small typed context helper that consumers can use instead of creating their own local registry wrappers

Keep the API minimal and package-agnostic. Do not register pi tools or extensions from this package.

## TDD
### RED
Write failing tests first:
- `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts`
- `packages/supi-code-runtime/__tests__/unit/workspace-context.test.ts`

The tests should prove, at minimum:
- workspace state is keyed by cwd
- semantic and structural capabilities can be registered independently
- pending / ready / inactive / unavailable states stay distinguishable
- clearing one workspace does not affect another
- the context helper returns the expected typed view when capabilities are present or absent

Run the new package tests and confirm they fail for the right reason before implementing the package.

### GREEN
Add the package files and minimal implementation to satisfy the tests.

### REFACTOR
Tighten naming, remove duplication between runtime/context helpers, and add JSDoc on exported APIs and non-obvious state semantics.

## Verification
Run:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/ -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json -v`
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-code-runtime -v`

Expected result: the new package builds cleanly, tests pass, and exports the shared runtime surface without any pi extension entrypoint.
