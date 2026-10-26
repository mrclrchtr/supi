<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-tree-sitter">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-tree-sitter/assets/social-preview.png" alt="SuPi Tree-sitter" width="100%">
  </a>
</div>

# @mrclrchtr/supi-tree-sitter

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Tree-sitter structural code analysis library for the [pi coding agent](https://github.com/earendil-works/pi).

This is a **library-only** package — it has no pi extension surface. Use `@mrclrchtr/supi-code-intelligence`
to access structural code-understanding workflows in pi.

## Install

```bash
npm install @mrclrchtr/supi-tree-sitter
```

Structural analysis always runs in a Node.js child process. Under Bun, including compiled applications such as Pi-Bolt, install Node.js and make the `node` executable available on `PATH`. SuPi validates that executable before it starts the process host. If Node.js is unavailable, structural analysis reports an installation error. There is no Bun Worker or main-thread parser fallback.

![Tree-sitter outline in action](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-tree-sitter.png)

## What you get

This package provides the parser-backed structural substrate consumed by `@mrclrchtr/supi-code-intelligence`:

- an owned parsing session API for direct library consumers
- a `StructuralProvider` adapter published through `./provider/tree-sitter-provider`
- one long-lived Structural Worker in a dedicated Node process; the Worker keeps Pi responsive during parser-backed work
- `CodeRequestControl` cancellation, absolute deadlines, shared atomic interruption, and hard-stop termination
- structural outline/import/export/node/callee/call-site operations through the asynchronous service surface
- operation-specific extension discovery through `getStructuralSearchSupportedExtensions()`

It does **not** register pi tools or commands on its own.

Coordinates in the library APIs use **1-based** line and character columns. Character positions use UTF-16 code units. Relative paths resolve from the session cwd, and a leading `@` on file paths is stripped.

## Language support matrix

The package bundles 16 grammars for 38 file extensions. All listed extensions support parsing, point-node inspection, and custom Tree-sitter queries without an LSP server. Grammar selection uses the file extension without case sensitivity, not a shebang.

**Yes** means that a built-in extractor or query exists. **No** means that the operation is not implemented for that grammar. Parser support does not guarantee complete extraction of every language construct.

| Language / grammar | File extensions | Outline | Imports | Exports | Call sites / callees |
|---|---|---|---|---|---|
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | Yes | Yes | Yes | Yes |
| TypeScript | `.ts`, `.mts`, `.cts` | Yes | Yes | Yes | Yes |
| TSX | `.tsx` | Yes | Yes | Yes | Yes |
| Python | `.py`, `.pyi` | Yes | Yes | No | Yes |
| Rust | `.rs` | Yes | Yes | No | Yes |
| Go | `.go` | Yes | Yes | No | Yes |
| C | `.c`, `.h` | Yes | Yes | No | Yes |
| C++ | `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++` | Yes | Yes | No | Yes |
| Java | `.java` | Yes | Yes | No | Yes |
| Kotlin | `.kt`, `.kts` | Yes | No | No | Yes |
| Ruby | `.rb`, `.gemspec` | Yes | No | No | Yes |
| Bash | `.sh`, `.bash`, `.zsh`, `.ksh` | Yes | No | No | Yes |
| HTML | `.html`, `.htm`, `.xhtml` | Yes | No | No | No |
| R | `.r` | Yes | No | No | Yes |
| SQL | `.sql` | Yes | No | No | No |
| LaTeX | `.tex`, `.sty`, `.cls` | Yes | Yes | No | No |

For a bulk scan, use `getStructuralSearchSupportedExtensions(operation)`. It returns operation-specific extensions: 38 for `outline`, 25 for `imports`, 8 for `exports`, and 31 for `call-sites`. It does not accept `callees` or public search-kind names.

### Mapping to Code Intelligence search

[`code_find` in AST mode](../supi-code-intelligence/README.md#language-support) uses these library operations:

| `code_find` kind | Structural operation | Match source |
|---|---|---|
| `definition` | `outline` | Extracted declaration names |
| `type`, `interface`, `class`, `method`, `enum` | `outline` | Declaration names filtered by outline kind |
| `import` | `imports` | Written import/source targets, not local aliases or resolved files |
| `export` | `exports` | Exported names |
| `call` | `call-sites` | Written call names, not symbol identity |

The `type` filter accepts `class`, `interface`, `type`, `enum`, `struct`, `union`, `record`, `object`, and `concept`. The other kind filters require an exact common outline kind. Not every grammar produces every kind. Results retain `nativeKind` separately. For example, Rust traits use the common `interface` filter but retain `trait`; Go structs retain `struct`, and Java records retain `record`. These do not become `class` results.

### Extraction limits

- TS/JS, Python, Java, Go, Rust, and C/C++ outlines include nested named declarations and members. They are not complete indexes of local variables, parameters, or anonymous expressions. Other languages retain their existing extraction depth. HTML outlines list only elements with non-empty `id` attributes. SQL outlines list supported `CREATE` declarations and first-level table/type members. LaTeX outlines list section headings and selected command, environment, label, acronym, glossary-entry, and color definitions.
- TypeScript and TSX use [checked build-time grammar patches](scripts/generate-typescript-wasm.mjs) for type-only star re-exports and arrays of qualified import types such as `import("node:fs").Dirent[]`. Runtime parsing retains the original source and coordinates; other grammar gaps still report recovered syntax.
- JavaScript-family imports collect `import` statements, not CommonJS `require()` calls. Exports collect file-level `export` statements, including TypeScript `export =`; they do not collect `module.exports` assignments or nested namespace exports. An eligible `.cjs` file can therefore return no imports or exports.
- Python imports retain `import`/`from` module targets, including relative prefixes. Java imports retain ordinary/static targets. Go imports retain single/grouped paths. Rust imports retain explicit `use` paths, `extern crate`, and external `mod` names; inline module bodies are not imports. C/C++ imports retain literal quoted and angle-bracket include targets. Grouped paths use explicit syntax only; no files or bindings are resolved. Conditional directives are written evidence, not proof of active dependencies. Dynamic loaders, computed targets, and C++20 module imports remain outside extraction support.
- LaTeX imports include package, class, source, and bibliography directives. Bibliography directives can refer to `.bib` files, but the grammar does not parse those files.
- Call-site and callee queries use syntax, not resolved symbol identity. Distinct sites have source ranges; repeated names on one line are not merged. Rust macro invocations are syntax evidence, not expanded calls. JSX tags are not call expressions. Library callee queries work without LSP, but new `code_graph` targets require semantic readiness in Code Intelligence.
- `.jsx` uses JavaScript; `.tsx` uses the separate TSX grammar. `.h` uses C by default. An explicit session association can select C++ without changing the supported suffix set. `.zsh` and `.ksh` use Bash; this is not complete support for those shell dialects.
- Go module manifests (`.mod`), Ruby ERB templates (`.erb`), and BibTeX (`.bib`) have [built-in LSP routes](../supi-lsp/README.md#built-in-route-matrix), but no AST grammar. Unlisted extensions, including JSON, YAML, TOML, and CSS, have no grammar. Custom LSP configuration does not add one.

A recovered parse returns `partial` with usable data, a reason, and available syntax-error ranges. Callers must preserve that state instead of interpreting it as complete absence or discarding the data. `canParse()` remains a parseability check, not a claim that syntax or extraction is complete.

Sources: [extension and grammar map](src/language.ts), [operation support](src/operation-support.ts), [call-site queries](src/tool/call-sites.ts), [callee queries](src/tool/callees.ts), and [Code Intelligence kind filters](../supi-code-intelligence/src/analysis/search/pattern-analysis.ts). Regression tests cover [grammar mappings](__tests__/language.test.ts), [operation eligibility](__tests__/operation-support.test.ts), and [call-site queries](__tests__/call-site-languages.test.ts).

## Architecture

`@mrclrchtr/supi-tree-sitter` is the **structural substrate** in SuPi's
code-understanding stack. It depends on `@mrclrchtr/supi-core` and
`@mrclrchtr/supi-code-runtime` for shared contracts, and provides structural
analysis via a lifecycle controller that publishes its capabilities into
the shared workspace runtime.

```text
supi-code-runtime  ← shared contracts + workspace runtime
    ↑
supi-tree-sitter  ← one owned Structural Worker + runtime capabilities
```

## Package surfaces

There is no package-root export. Use one of these explicit subpaths:

- `@mrclrchtr/supi-tree-sitter/api` — reusable parsing session factory, lifecycle controller, language helpers, and shared result types
- `@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider` — shared StructuralProvider adapter

This is a **library-only** package. Public tool registration and pi event handlers belong to `@mrclrchtr/supi-code-intelligence`.

Owned session example:

```ts
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";

const session = createTreeSitterSession("/project");

const parseable = await session.canParse("src/index.ts");
const outline = await session.outline("src/index.ts");
const callees = await session.calleesAt("src/index.ts", 42, 10);

await session.dispose();
```

For C-family paths, direct library callers can pass ordered rules:

```ts
const session = createTreeSitterSession("/project", {
  fileAssociations: [
    { pattern: "vendor/**/*.h", language: "c" },
    { pattern: "**/*.h", language: "cpp" },
  ],
});
```

The first match wins; patterns are case-sensitive project-relative globs. Without rules, the extension map stays unchanged. Direct callers own configuration trust. The Code Intelligence workspace host reads trusted project rules and supplies the same snapshot to Tree-sitter and LSP. This library does not read SuPi configuration on its own.

## Structural performance baseline

Run the stable outline fixture on the same machine and dependency versions:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter bench:structural
```

The benchmark reports cold and repeated outline results. It also reports cold and repeated call-site query results. Repeated operations reuse unchanged parsed trees and compiled queries. Debug capture is active, so the baseline includes the internal timing observation cost. The benchmark records measurements but does not set a pass or fail threshold.

The Structural Worker reads files asynchronously. It identifies fresh parsed files by canonical path, grammar, and SHA-256 content hash. Cached trees use true least-recently-used eviction with limits of 128 files and 32 MiB of retained UTF-8 source bytes. Compiled queries use the same policy with limits of 128 queries and 512 KiB of retained UTF-8 query text. Source and query byte counts are memory-related proxies because `web-tree-sitter` does not report WASM resource sizes. Cached canonical trees stay private in the Worker.

The Structural Worker runs in a dedicated Node child process. The process uses `--liftoff-only` so V8 avoids the optimizing WebAssembly compiler that uses unsafe amounts of memory for large grammars. This applies to every grammar in the Worker. Pi's main process does not receive this flag, and a V8 failure in the Worker process cannot crash Pi. A Node parent uses its current executable and advanced IPC. A Bun parent selects Node explicitly and uses JSON IPC with bounded base64 result chunks; the private Worker-thread protocol stays unchanged.

All structural service operations accept optional `CodeRequestControl`. The parent converts cancellation to one shared atomic flag and forwards absolute deadlines. When present, it forwards only the opaque Debug Operation ID through the Worker protocol so parse and query timing events keep direct request ownership. Direct library calls have no ID. The process host creates a shared atomic flag for its Worker thread because Node IPC cannot share the parent flag. Worker read phases observe a local abort signal. Parser and query progress callbacks observe the flag and deadline. If cooperative interruption does not settle in the fixed 250 ms grace period, the parent terminates the Worker process. Valid queued work keeps FIFO order on one fresh Worker with cold caches. There is no main-thread parser fallback.

## Source

- `src/api.ts` — public library entrypoint
- `src/worker/process-host.mjs` — process bridge and Worker-local cancellation flags
- `src/worker/bootstrap.mjs` — package-owned Worker bootstrap and direct `jiti` loader
- `src/worker/runtime.ts` — Worker-only parser and query runtime
- `src/worker/parsed-file-store.ts` — Worker-only parsed-file and compiled-query reuse
- `src/session/structural-worker-client.ts` — bounded FIFO mailbox, protocol, cancellation, and restart ownership
- `src/session/structural-worker-process.ts` — isolated Node process and IPC bridge
- `src/session/runtime-controller.ts` — generation-fenced shared Worker lifecycle
- `src/session/session.ts` — asynchronous Worker-proxy service and owned session API
- `src/operation-support.ts` — authoritative operation-specific extension support
- `src/provider/tree-sitter-provider.ts` — `StructuralProvider` adapter consumed by `@mrclrchtr/supi-code-intelligence`
- `src/tool/outline.ts`, `src/tool/outline-*.ts`, `src/tool/imports.ts`, `src/tool/exports.ts`, `src/tool/node-at.ts`, `src/tool/callees.ts`, `src/tool/call-sites.ts` — Worker-internal structural analyses
