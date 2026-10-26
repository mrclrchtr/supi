# CLAUDE.md

## Scope

This library owns parser-backed structural analysis. Raw runtime and extraction helpers are Worker-internal. `supi-code-intelligence` alone owns public tool registration and session lifecycle handlers; do not add a Pi extension here.

## WASM vendoring strategy

All grammar WASM files are **vendored** in `resources/grammars/<id>/` and shipped with the package. The native `tree-sitter-*` npm packages are `devDependencies` only — they are never resolved at runtime.

- Copy unmodified prebuilt WASM with `scripts/vendor-wasm.mjs`.
- **TypeScript and TSX** are built from source by `scripts/generate-typescript-wasm.mjs` with checked grammar patches for type-only star re-exports and import-type arrays. Preserve these grammar fixes rather than rewriting parse input or hiding recovery evidence.
- **Kotlin** (`tree-sitter-kotlin`) does not ship `.wasm` — built from source by `scripts/generate-kotlin-wasm.mjs` using `tree-sitter-cli`.
- **SQL** (`@derekstride/tree-sitter-sql`) does not ship `.wasm` — built from source by `scripts/generate-sql-wasm.mjs` using `tree-sitter-cli`.
- **LaTeX** (`@pfoerster/tree-sitter-latex`) does not ship `.wasm` — built from source by `scripts/generate-latex-wasm.mjs` using `tree-sitter-cli`. The script also copies and checks the upstream MIT `LICENSE` in `resources/grammars/latex/`.

### When to regenerate

Refresh every artifact after grammar or CLI updates. Use `vendor:wasm` alone only when the prebuilt grammar packages changed.

After any `tree-sitter-cli` update, first verify the resolved version:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter exec node -p "require('tree-sitter-cli/package.json').version"
```

Then regenerate every artifact in one step:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter generate:all-wasm
```

This refreshes the CLI version in metadata; the WASM hashes may stay unchanged.
Use one command to check every vendored artifact in CI or before publishing:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter check:all-wasm
```

If the installed version is stale, run:

```bash
rm -rf packages/supi-tree-sitter/node_modules
pnpm install --force
```

Vendored WASM metadata (`.wasm.json`) tracks the source npm package version and SHA256 so stale WASM is detected on CI.

## Gotchas

- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- Structural services apply optional shared `CodeRequestControl` in the Worker. The parent maps it to an absolute deadline, a local Worker abort, one shared atomic cancellation slot, and the optional opaque Debug Operation ID. Never send Pi's raw Tool-call identity. A 250 ms hard stop terminates uncooperative work. Never add a main-thread parser fallback.
- The Structural Worker runs in a child Node process with `--liftoff-only`. Node rejects V8 compile flags in `worker_threads.execArgv`; do not move this flag to the Worker or to Pi's process. The process host creates the shared cancellation slot before it forwards each request to the Worker.
- `TreeSitterSession.canParse()` is a parseability check only. The Worker keeps canonical trees private. The installed `web-tree-sitter` `Language` type has no release method; Worker disposal deletes trees, queries, and parsers, then drops language references.
- Standalone sessions use the existing suffix mapping. A caller that owns trusted project config may pass validated `fileAssociations` to `createTreeSitterSession()`. The rules enter the Structural Worker at startup and stay fixed for that session.
- `TreeSitterRuntimeController` generation-fences startup. Shutdown and a newer start await pending session disposal, and stale startup continuations must not publish capability state.
- `TreeSitterSession.dispose()` is asynchronous. All owners must await it.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline remains shallow for existing grammars. For JavaScript/TypeScript, Python, Java, Go, Rust, C, and C++, it also extracts named declarations nested in functions and types. Do not index local variables, parameters, destructuring, or anonymous expressions as declarations.
- `outline` supports every parser grammar. HTML outline evidence is limited to elements with non-empty `id` attributes; SQL outline evidence is limited to supported `CREATE` declarations plus shallow table/type members. Ruby gemspecs and KornShell files reuse the Ruby and Bash grammars. ERB and Go module manifests stay semantic-only because their syntax is not Ruby or Go source. `imports` supports JavaScript, TypeScript, TSX, Python `import`/`from`, Java ordinary/static imports, Go single/grouped imports, Rust `use`/`extern crate`/external `mod`, C/C++ literal includes, and LaTeX directives. It does not include dynamic loaders, computed specifiers, inline Rust modules, macro-generated targets, or include-macro expansion. `exports` supports JavaScript, TypeScript, and TSX. LaTeX imports include package, class, source, and bibliography directives. `call-sites` supports every parser grammar except HTML, SQL, and LaTeX. `getStructuralSearchSupportedExtensions()` is the authoritative public declaration used by AST Scan eligibility. The runtime also exposes a `query()` method on `TreeSitterSession` that works across all parser grammars.

## Layering

Keep this package independent of `supi-lsp` internals and correct when installed independently. Put shared capability state in `supi-code-runtime` and generic utilities in `supi-core`.

`WorkspaceRuntime` is the only process-shared provider seam. `TreeSitterRuntimeController` receives a `WorkspaceRuntime` in its constructor and registers or clears the structural provider for its cwd. Use `createTreeSitterSession()` only when you need an explicitly owned Worker lifecycle, and await its disposal.
