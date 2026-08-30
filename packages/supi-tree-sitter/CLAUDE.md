# CLAUDE.md

## Scope

`@mrclrchtr/supi-tree-sitter` is a **library-only** package with one explicit surface:
- `@mrclrchtr/supi-tree-sitter/api` → `src/api.ts` / `src/index.ts` → exports asynchronous service APIs (`createTreeSitterSession()`, `getSessionTreeSitterService()`), language and operation-support helpers, the lifecycle controller, and shared result types. Raw runtime and extraction helpers are Worker-internal.

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

Run `pnpm --filter @mrclrchtr/supi-tree-sitter vendor:wasm` for grammar packages that ship prebuilt WASM.

After any `tree-sitter-cli` update, first verify the resolved version:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter exec node -p "require('tree-sitter-cli/package.json').version"
```

Then run both generators:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter generate:kotlin-wasm
pnpm --filter @mrclrchtr/supi-tree-sitter generate:sql-wasm
```

These generators refresh the CLI version in metadata; the WASM hashes may stay unchanged. If the installed version is stale, run:

```bash
rm -rf packages/supi-tree-sitter/node_modules
pnpm install --force
```

Vendored WASM metadata (`.wasm.json`) tracks the source npm package version and SHA256 so stale WASM is detected on CI.

## Gotchas

- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- Structural services apply optional shared `CodeRequestControl` in the Worker. The parent maps it to an absolute deadline, a local Worker abort, one shared atomic cancellation slot, and the optional opaque Debug Operation ID. Never send Pi's raw Tool-call identity. A 250 ms hard stop terminates uncooperative work. Never add a main-thread parser fallback.
- `TreeSitterSession.canParse()` is a parseability check only. The Worker keeps canonical trees private. The installed `web-tree-sitter` `Language` type has no release method; Worker disposal deletes trees, queries, and parsers, then drops language references.
- `TreeSitterRuntimeController` generation-fences startup. Shutdown and a newer start await pending session disposal, and stale startup continuations must not publish capability state.
- `TreeSitterSession.dispose()` is asynchronous. All owners must await it.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
- `outline` supports every parser grammar. HTML outline evidence is limited to elements with non-empty `id` attributes; SQL outline evidence is limited to supported `CREATE` declarations plus shallow table/type members. Ruby gemspecs and KornShell files reuse the Ruby and Bash grammars. ERB and Go module manifests stay semantic-only because their syntax is not Ruby or Go source. `imports` and `exports` remain JavaScript/TypeScript-only. `call-sites` supports only grammars with a registered, contract-tested query (currently every parser grammar except HTML and SQL). `getStructuralSearchSupportedExtensions()` is the authoritative public declaration used by AST Scan eligibility. The runtime also exposes a `query()` method on `TreeSitterSession` that works across all parser grammars.
- `pnpm peers check` currently reports missing `tree-sitter` peers for `@derekstride/tree-sitter-sql` and `tree-sitter-kotlin`; these grammar packages are dev-only WASM generators, so treat that warning as known workspace noise unless the vendoring strategy changes.

## Packaging

- Native `tree-sitter-*` packages are `devDependencies` only — NOT bundled or resolved at runtime
- `web-tree-sitter` and `jiti` are runtime dependencies and bundled dependencies
- All grammar WASM files are vendored in `resources/` and shipped via the `files` field (`"resources"` entry in `package.json`)
- This reduces `npm pack` size for consumers by ~89% compared to bundling native npm packages

## Layering

`supi-tree-sitter` is the structural substrate in SuPi's code-understanding stack:

1. `supi-tree-sitter` — parser-backed structural analysis (this package, library-only)
2. `supi-lsp` — live semantic analysis through language servers (library-only)
3. `supi-code-intelligence` — unified agent-facing layer above both (**the sole host for extension registration**)

Keep this package independent of `supi-lsp` internals. Any shared utilities belong in `supi-core`.

The package publishes a shared session-scoped Tree-sitter service through `getSessionTreeSitterService(cwd)`. Its backing storage delegates to `createSessionStateRegistry()` from `@mrclrchtr/supi-core/api`, while the Tree-sitter package keeps its own `ready | unavailable` wrapper local. Peer packages that only need structural operations should prefer that shared service over repeatedly creating owned sessions. Use `createTreeSitterSession()` only when you need an explicitly owned Worker lifecycle, and await its disposal.
