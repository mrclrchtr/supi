# CLAUDE.md

## Scope

`@mrclrchtr/supi-tree-sitter` is a **library-only** package with one explicit surface:
- `@mrclrchtr/supi-tree-sitter/api` → `src/api.ts` / `src/index.ts` → exports structured runtime/service APIs (`createTreeSitterSession()`, `getSessionTreeSitterService()`), structural extraction services (`lookupCalleesAt`, `collectOutline`, `extractExports`, etc.), language detection helpers, and shared types for other SuPi packages.

This package has **no pi extension surface** — no `pi.extensions`, no `src/extension.ts`, no `./extension` export. Public tool registration and session lifecycle handlers live in `@mrclrchtr/supi-code-intelligence`. The package does not depend on `supi-lsp` and must remain correct when installed independently.

## Public surfaces

- `@mrclrchtr/supi-tree-sitter/api` → `src/api.ts` → reusable library surface (session factory, shared service access, structural extraction functions, shared types)
- `@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider` → `src/provider/tree-sitter-provider.ts` → shared `StructuralProvider` adapter

## WASM vendoring strategy

All grammar WASM files are **vendored** in `resources/grammars/<id>/` and shipped with the package. The native `tree-sitter-*` npm packages are `devDependencies` only — they are never resolved at runtime.

- **13 grammars from 12 npm packages** (javascript, typescript, tsx, python, rust, go, c, cpp, java, ruby, bash, html, r) ship `.wasm` — `tree-sitter-typescript` provides both `typescript` and `tsx`. Copied by `scripts/vendor-wasm.mjs`.
- **Kotlin** (`tree-sitter-kotlin`) does not ship `.wasm` — built from source by `scripts/generate-kotlin-wasm.mjs` using `tree-sitter-cli`
- **SQL** (`@derekstride/tree-sitter-sql`) does not ship `.wasm` — built from source by `scripts/generate-sql-wasm.mjs` using `tree-sitter-cli`

### When to regnerate

Run `node scripts/vendor-wasm.mjs` whenever `tree-sitter-*` devDependencies are bumped. Run `pnpm --filter @mrclrchtr/supi-tree-sitter check:wasm` in CI to verify checksums match.

Vendored WASM metadata (`.wasm.json`) tracks the source npm package version and SHA256 so stale WASM is detected on CI.

## Source layout

```text
src/
  api.ts              # public API surface (library-only, no pi extension)
  index.ts            # re-export surface
  types.ts            # shared type definitions
  coordinates.ts      # 1-based UTF-16 coordinate conversion
  language.ts         # file extension → grammar ID detection and WASM path resolution
  syntax-node.ts      # syntax node interface
  session/
    runtime.ts        # grammar initialization, parser reuse, parse/query services
    service-registry.ts # shared session-scoped structural service registry (backed by core helper)
    session.ts        # runtime-backed service helpers and owned session factory
    runtime-controller.ts # Tree-sitter runtime lifecycle controller
    runtime-registration.ts # Runtime registration helpers
  tool/
    call-sites.ts     # call-site extraction
    callees.ts        # callee extraction
    exports.ts        # export extraction
    imports.ts        # import extraction
    node-at.ts        # node_at action
    outline.ts        # outline extraction
    structure.ts      # re-exports from tool sub-modules
  provider/
    tree-sitter-provider.ts # StructuralProvider impl consumed by supi-code-intelligence
```

## Key files

- `resources/grammars/<id>/` — vendored WASM files for all 14 supported grammars
- `src/session/runtime.ts` — grammar initialization, parser reuse, parse/query services
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/session/session.ts` — runtime-backed service helpers and owned session factory
- `src/provider/tree-sitter-provider.ts` — StructuralProvider impl consumed by supi-code-intelligence
- `src/tool/call-sites.ts` — call-site extraction (consumed by code_find AST call mode)
- `scripts/generate-kotlin-wasm.mjs` — builds Kotlin WASM from source
- `scripts/generate-sql-wasm.mjs` — builds SQL WASM from source

## Supported languages

15 grammars vendored in `resources/grammars/<id>/`: JavaScript, TypeScript, TSX, Python, Rust, Go, C, C++, Java, Kotlin, Ruby, Bash/Shell, HTML, R, SQL. See `resources/grammars/` for the complete file-extension mapping.

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

- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
- `outline`, `imports`, and `exports` are currently JavaScript/TypeScript-only; `node_at` and `call-sites` work across all supported grammars. The runtime also exposes a `query()` method on `TreeSitterSession` that works across all grammars.
- `pnpm peers check` currently reports missing `tree-sitter` peers for `@derekstride/tree-sitter-sql` and `tree-sitter-kotlin`; these grammar packages are dev-only WASM generators, so treat that warning as known workspace noise unless the vendoring strategy changes.

## Packaging

- Native `tree-sitter-*` packages are `devDependencies` only — NOT bundled or resolved at runtime
- Only `web-tree-sitter` is a runtime `dependency`
- All grammar WASM files are vendored in `resources/` and shipped via the `files` field (`"resources"` entry in `package.json`)
- This reduces `npm pack` size for consumers by ~89% compared to bundling native npm packages

## Layering

`supi-tree-sitter` is the structural substrate in SuPi's code-understanding stack:

1. `supi-tree-sitter` — parser-backed structural analysis (this package, library-only)
2. `supi-lsp` — live semantic analysis through language servers (library-only)
3. `supi-code-intelligence` — unified agent-facing layer above both (**the sole host for extension registration**)

Keep this package independent of `supi-lsp` internals. Any shared utilities belong in `supi-core`.

The package publishes a shared session-scoped Tree-sitter service through `getSessionTreeSitterService(cwd)`. Its backing storage delegates to `createSessionStateRegistry()` from `@mrclrchtr/supi-core/api`, while the Tree-sitter package keeps its own `ready | unavailable` wrapper local. Peer packages that only need structural operations should prefer that shared service over repeatedly creating owned sessions. Use `createTreeSitterSession()` only when you need an explicitly owned lifecycle.
