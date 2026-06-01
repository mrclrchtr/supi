# Unbrittle code-intelligence tool surface

## Problem
The code-intelligence tool surface has wide surface area with uneven depth. Several features are cosmetic (accept parameters but don't use them), semantically misleading, or advertised but not implemented.

## Waves

### Wave 1: Remove brittleness (surface narrowing)

**1a. Fix `code_find` AST `kind: call|type|test`** — Currently `kind: call` finds function/method declarations via tree-sitter outline, not call expressions. This is semantically misleading for agents. Narrow to definition/export/import only, mark call/type/test as "not yet implemented" until real call-expression matching exists (Wave 2b).

**1b. Remove `baseRef` from `code_impact`** — Parameter accepted, passed through, displayed as decorative line. Does zero diff-aware computation. Remove from schema, types, executor, and renderer.

**1c. Narrow `code_refactor` operations to `rename_symbol` only** — `update_imports`, `delete_dead_code`, `rename_file`, `move_file` all depend on LSP provider whims with no fallback. Only `rename_symbol` has a real implementation path. Reduce schema enum.

**1d. Remove unsupported `code_apply` modes** — `apply-and-format` and `apply-and-verify` always return explicit unavailable. Remove from schema enum.

### Wave 2: Finish high-ROI features (easy + solid)

**2a. Implement `code_graph` `tests` relation** — The test-file discovery logic (`findTestCompanionFiles` + `extractTestFunctions`) already exists in `generate-context.ts`. Extract it to a shared module and wire it into `execute-graph.ts`'s relation dispatch.

**2b. Implement `code_find` AST call-site matching** — Use tree-sitter `call_expression` queries instead of outline-based matching. This turns `kind: call` from "find function declarations" into "find call sites" — what agents actually expect.

## Files to modify
- `src/workflow/schemas.ts` — remove baseRef, narrow refactor ops, narrow apply modes
- `src/tool/execute-find.ts` — mark call/type/test as not-yet-implemented
- `src/tool/tool-specs.ts` — update descriptions and guidelines
- `src/tool/execute-impact.ts` — remove baseRef from types
- `src/use-case/generate-impact.ts` — remove baseRef from input/deps
- `src/presentation/markdown/impact.ts` — remove baseRef rendering
- `src/tool/execute-refactor-plan.ts` — keep internal compatibility, narrow public ops
- `src/tool/execute-apply.ts` — simplify modes
- `src/tool/execute-graph.ts` — add tests relation
- `src/pattern-structured.ts` — add call-expression matching for Wave 2b
- NEW: `src/analysis/relations/tests.ts` — shared test-file discovery (extracted from generate-context.ts)
- `src/use-case/generate-context.ts` — use shared test discovery
- Tests: update affected test files

## Verification
- `pnpm vitest run packages/supi-code-intelligence/`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- Manual test: `code_find` AST call returns "not yet implemented"
- Manual test: `code_impact` rejects baseRef parameter
- Manual test: `code_refactor` only accepts rename/rename_symbol
- Manual test: `code_apply` only accepts mode "apply"
- Manual test: `code_graph` tests relation finds companion test files