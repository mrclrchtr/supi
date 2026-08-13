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

### When to regenerate

Run `node scripts/vendor-wasm.mjs` whenever `tree-sitter-*` devDependencies are bumped. Run `pnpm --filter @mrclrchtr/supi-tree-sitter check:wasm` in CI to verify checksums match.

Vendored WASM metadata (`.wasm.json`) tracks the source npm package version and SHA256 so stale WASM is detected on CI.

### Generator dependency updates

Before you regenerate WASM after a generator dependency update, verify the resolved version. For `tree-sitter-cli`:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter exec node -p "require('tree-sitter-cli/package.json').version"
```

If it is old, rebuild the package dependencies, then verify again:

```bash
rm -rf packages/supi-tree-sitter/node_modules
pnpm install --force
```

## Source layout

```text
src/
  api.ts              # public API surface (library-only, no pi extension)
  index.ts            # re-export surface
  types.ts            # shared type definitions
  coordinates.ts      # 1-based UTF-16 coordinate conversion
  language.ts         # file extension → grammar ID detection and WASM path resolution
  operation-support.ts # extractor-specific extension support for structural search
  syntax-node.ts      # syntax node interface
  session/
    runtime.ts        # grammar initialization, parser reuse, parse/query services
    parsed-file-store.ts # private bounded LRU ownership for parsed files and compiled queries
    structural-timing.ts # sanitized parse/query timing observations
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
    outline.ts        # JavaScript/TypeScript outline extraction and dispatch
    outline-polyglot.ts # non-JavaScript/TypeScript outline dispatch
    outline-c-family.ts # C and C++ outline extraction
    outline-jvm.ts    # Java and Kotlin outline extraction
    outline-scripting.ts # Ruby, Bash/shell, and R outline extraction
    outline-html-sql.ts # HTML id and SQL schema outline extraction
    structure.ts      # re-exports from tool sub-modules
  provider/
    tree-sitter-provider.ts # StructuralProvider impl consumed by supi-code-intelligence
```

## Key files

- `resources/grammars/<id>/` — vendored WASM files for all 15 supported grammars
- `src/session/runtime.ts` — grammar initialization, parser reuse, parse/query services
- `src/session/parsed-file-store.ts` — private parsed-file and compiled-query LRU ownership
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/session/session.ts` — runtime-backed service helpers and owned session factory
- `src/provider/tree-sitter-provider.ts` — StructuralProvider impl consumed by supi-code-intelligence
- `src/operation-support.ts` — operation-specific language support derived from extractor predicates/query registration
- `src/tool/call-sites.ts` — call-site extraction (consumed by code_find AST call mode)
- `scripts/generate-kotlin-wasm.mjs` — builds Kotlin WASM from source
- `scripts/generate-sql-wasm.mjs` — builds SQL WASM from source

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
- Structural services accept optional shared `CodeRequestControl` metadata. Adapters preserve the exact value, but runtime methods do not apply its signal or deadline in the expansion stage.
- `TreeSitterSession.canParse()` is a parseability check only. The parsed-file store keeps canonical trees private and gives runtime consumers owned shallow copies. Delete each owned copy. The installed `web-tree-sitter` `Language` type has no release method; runtime disposal deletes trees, queries, and parsers, then drops language references.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
- `outline` supports every parser grammar. HTML outline evidence is limited to elements with non-empty `id` attributes; SQL outline evidence is limited to supported `CREATE` declarations plus shallow table/type members. Ruby gemspecs and KornShell files reuse the Ruby and Bash grammars. ERB and Go module manifests stay semantic-only because their syntax is not Ruby or Go source. `imports` and `exports` remain JavaScript/TypeScript-only. `call-sites` supports only grammars with a registered, contract-tested query (currently every parser grammar except HTML and SQL). `getStructuralSearchSupportedExtensions()` is the authoritative public declaration used by AST Scan eligibility. The runtime also exposes a `query()` method on `TreeSitterSession` that works across all parser grammars.
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
