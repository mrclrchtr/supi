# CLAUDE.md

## Scope

`@mrclrchtr/supi-tree-sitter` has two surfaces:
- `tree-sitter.ts` — registers the `tree_sitter` tool for pi
- `index.ts` — exports `createTreeSitterSession()` and shared types for other SuPi packages

## Key files

- `runtime.ts`, `session.ts` — grammar initialization, parser reuse, session lifecycle, and `dispose()`
- `outline.ts`, `structure.ts`, `formatting.ts` — tool action extraction, formatting, and output caps
- `coordinates.ts` — 1-based UTF-16 coordinate conversion shared with `node_at` and query results

## Validation

- `pnpm exec biome check packages/supi-tree-sitter && pnpm vitest run packages/supi-tree-sitter/ && pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`

## Gotchas

- Tree-sitter TS fixtures must still parse for Biome; avoid invalid multi-default-export fixtures, split cases into files.
- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
