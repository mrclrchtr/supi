# CLAUDE.md

## Scope

`@mrclrchtr/supi-tree-sitter` has two surfaces:
- `tree-sitter.ts` — registers the `tree_sitter` tool for pi
- `index.ts` — exports `createTreeSitterSession()` and shared types for other SuPi packages

The package is designed as a standalone structural-analysis substrate. It does not depend on `supi-lsp` and must remain correct when installed independently.

## Key files

- `runtime.ts`, `session.ts` — grammar initialization, parser reuse, session lifecycle, and `dispose()`
- `outline.ts`, `structure.ts`, `formatting.ts` — tool action extraction, formatting, and output caps
- `coordinates.ts` — 1-based UTF-16 coordinate conversion shared with `node_at` and query results
- `language.ts` — file extension → grammar ID detection and WASM path resolution
- `resources/grammars/kotlin/` — vendored Kotlin WASM plus source/version/checksum metadata
- `scripts/generate-kotlin-wasm.mjs` — regenerates/checks the vendored Kotlin grammar from `tree-sitter-kotlin`

## Supported languages

Grammars are resolved via npm peer dependencies, except Kotlin which uses a vendored WASM generated from the trusted `fwcd/tree-sitter-kotlin` npm package. Supported file families:
- **JavaScript/TypeScript**: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.tsx`
- **Python**: `.py`, `.pyi`
- **Rust**: `.rs`
- **Go**: `.go`, `.mod`
- **C/C++**: `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`
- **Java**: `.java`
- **Kotlin**: `.kt`, `.kts`
- **Ruby**: `.rb`

## Validation

- `pnpm --filter @mrclrchtr/supi-tree-sitter check:kotlin-wasm && pnpm exec biome check packages/supi-tree-sitter && pnpm vitest run packages/supi-tree-sitter/ && pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`

## Gotchas

- Tree-sitter TS fixtures must still parse for Biome; avoid invalid multi-default-export fixtures, split cases into files.
- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
- Prompt guidance in `tree-sitter.ts` must be standalone-safe: describe structural analysis directly and do not name the `lsp` tool as an available sibling. Use generic terms like "semantic language-server tooling" if a distinction is needed.

## Layering

`supi-tree-sitter` is the structural substrate in SuPi's code-understanding stack:

1. `supi-tree-sitter` — parser-backed structural analysis (this package)
2. `supi-lsp` — live semantic analysis through language servers
3. `supi-code-intelligence` (future) — unified agent-facing layer above both

Keep this package independent of `supi-lsp` internals. Any shared utilities belong in `supi-core`.
