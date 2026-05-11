# CLAUDE.md

## Scope

`@mrclrchtr/supi-tree-sitter` has two surfaces:
- `tree-sitter.ts` — registers the `tree_sitter` tool for pi
- `index.ts` — exports `createTreeSitterSession()` and shared types for other SuPi packages

The package is designed as a standalone structural-analysis substrate. It does not depend on `supi-lsp` and must remain correct when installed independently.

## WASM vendoring strategy

All grammar WASM files are **vendored** in `resources/grammars/<id>/` and shipped with the package. The native `tree-sitter-*` npm packages are `devDependencies` only — they are never resolved at runtime.

- **12 grammars** (javascript, typescript, tsx, python, rust, go, c, cpp, java, ruby, bash, html, r) ship `.wasm` in their npm packages — copied by `scripts/vendor-wasm.mjs`
- **Kotlin** (`tree-sitter-kotlin`) does not ship `.wasm` — built from source by `scripts/generate-kotlin-wasm.mjs` using `tree-sitter-cli`
- **SQL** (`@derekstride/tree-sitter-sql`) does not ship `.wasm` — built from source by `scripts/generate-sql-wasm.mjs` using `tree-sitter-cli`

### When to regnerate

Run `node scripts/vendor-wasm.mjs` whenever `tree-sitter-*` devDependencies are bumped. Run `pnpm --filter @mrclrchtr/supi-tree-sitter check:wasm` in CI to verify checksums match.

Vendored WASM metadata (`.wasm.json`) tracks the source npm package version and SHA256 so stale WASM is detected on CI.

## Key files

- `runtime.ts`, `session.ts` — grammar initialization, parser reuse, session lifecycle, and `dispose()`
- `outline.ts`, `structure.ts`, `formatting.ts` — tool action extraction, formatting, and output caps
- `coordinates.ts` — 1-based UTF-16 coordinate conversion shared with `node_at` and query results
- `language.ts` — file extension → grammar ID detection and vendored WASM path resolution
- `resources/grammars/<id>/` — vendored WASM files for all 14 supported grammars
- `scripts/vendor-wasm.mjs` — copies WASM from installed npm packages (13 grammars)
- `scripts/generate-kotlin-wasm.mjs` — builds Kotlin WASM from source
- `scripts/generate-sql-wasm.mjs` — builds SQL WASM from source

## Supported languages

All grammar WASM files are vendored and resolved at runtime from `resources/grammars/<id>/`. See `resources/grammars/` for the complete list. Supported file families:
- **JavaScript/TypeScript**: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.tsx`
- **Python**: `.py`, `.pyi`
- **Rust**: `.rs`
- **Go**: `.go`, `.mod`
- **C/C++**: `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`
- **Java**: `.java`
- **Kotlin**: `.kt`, `.kts`
- **Ruby**: `.rb`
- **Bash/Shell**: `.sh`, `.bash`, `.zsh`
- **HTML**: `.html`, `.htm`, `.xhtml`
- **R**: `.r`
- **SQL**: `.sql`

## Validation

```bash
node scripts/vendor-wasm.mjs --check && \
pnpm --filter @mrclrchtr/supi-tree-sitter check:kotlin-wasm && \
pnpm --filter @mrclrchtr/supi-tree-sitter check:sql-wasm && \
pnpm exec biome check packages/supi-tree-sitter && \
pnpm vitest run packages/supi-tree-sitter/ && \
pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json && \
pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json
```

## Gotchas

- Tree-sitter TS fixtures must still parse for Biome; avoid invalid multi-default-export fixtures, split cases into files.
- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
- `outline`, `imports`, and `exports` are currently JavaScript/TypeScript-only; `node_at` and `query` work across all supported grammars, so docs and tool text must describe that split explicitly.
- Prompt guidance in `tree-sitter.ts` must be standalone-safe: describe structural analysis directly and do not name the `lsp` tool as an available sibling. Use generic terms like "semantic language-server tooling" if a distinction is needed.

## Packaging

- Native `tree-sitter-*` packages are `devDependencies` only — NOT bundled or resolved at runtime
- Only `web-tree-sitter` is a runtime `dependency`
- All grammar WASM files are vendored in `resources/` and shipped via the `files` field (`"resources"` entry in `package.json`)
- This reduces `npm pack` size for consumers by ~89% compared to bundling native npm packages

## Layering

`supi-tree-sitter` is the structural substrate in SuPi's code-understanding stack:

1. `supi-tree-sitter` — parser-backed structural analysis (this package)
2. `supi-lsp` — live semantic analysis through language servers
3. `supi-code-intelligence` — unified agent-facing layer above both

Keep this package independent of `supi-lsp` internals. Any shared utilities belong in `supi-core`.
