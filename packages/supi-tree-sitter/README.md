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

![Tree-sitter outline in action](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-tree-sitter.png)

## What you get

This package provides the parser-backed structural substrate consumed by `@mrclrchtr/supi-code-intelligence`:

- a shared session-scoped Tree-sitter service for structural analysis
- an owned parsing session API for direct library consumers
- a `StructuralProvider` adapter published through `./provider/tree-sitter-provider`
- a long-lived owned Structural Worker that keeps Pi responsive during parser-backed work
- `CodeRequestControl` cancellation, absolute deadlines, shared atomic interruption, and hard-stop termination
- structural outline/import/export/node/callee/call-site operations through the asynchronous service surface
- operation-specific extension discovery through `getStructuralSearchSupportedExtensions()`

It does **not** register pi tools or commands on its own.

Coordinates in the library APIs use **1-based** line and character columns. Character positions use UTF-16 code units. Relative paths resolve from the session cwd, and a leading `@` on file paths is stripped.

## Supported file families

- JavaScript / TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`)
- Python (`.py`, `.pyi`)
- Rust (`.rs`)
- Go (`.go`)
- C / C++ (`.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`)
- Java (`.java`)
- Kotlin (`.kt`, `.kts`)
- Ruby (`.rb`, `.gemspec`)
- Bash / shell (`.sh`, `.bash`, `.zsh`, `.ksh`)
- HTML (`.html`, `.htm`, `.xhtml`)
- R (`.r`)
- SQL (`.sql`)

Outline collection supports every listed family. HTML outlines contain elements with non-empty `id` attributes; SQL outlines contain `CREATE` declarations and shallow table/type members. Import and export collection remains JavaScript/TypeScript-only, and call-site collection supports every listed family except HTML and SQL. Go module manifests and ERB templates are intentionally excluded because the Go and Ruby grammars do not parse those mixed or separate syntaxes; `supi-lsp` still handles them semantically. Consumers performing a bulk structural scan should use `getStructuralSearchSupportedExtensions(operation)` rather than treating parser support as operation support.

## Architecture

`@mrclrchtr/supi-tree-sitter` is the **structural substrate** in SuPi's
code-understanding stack. It depends on `@mrclrchtr/supi-core` and
`@mrclrchtr/supi-code-runtime` for shared contracts, and provides structural
analysis via a session-scoped Tree-sitter service that publishes its
capabilities into the shared workspace runtime.

```text
supi-code-runtime  ← shared contracts + workspace runtime
    ↑
supi-tree-sitter  ← one owned Structural Worker + session-scoped service + runtime capabilities
```

## Package surfaces

- `@mrclrchtr/supi-tree-sitter/api` — reusable parsing session factory, shared session-scoped structural service access, and shared result types
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

Shared session-scoped service example:

```ts
import { getSessionTreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";

const state = getSessionTreeSitterService("/project");
if (state.kind === "ready") {
  const outline = await state.service.outline("src/index.ts");
}
```

## Structural performance baseline

Run the stable outline fixture on the same machine and dependency versions:

```bash
pnpm --filter @mrclrchtr/supi-tree-sitter bench:structural
```

The benchmark reports cold and repeated outline results. It also reports cold and repeated call-site query results. Repeated operations reuse unchanged parsed trees and compiled queries. Debug capture is active, so the baseline includes the internal timing observation cost. The benchmark records measurements but does not set a pass or fail threshold.

The Structural Worker reads files asynchronously. It identifies fresh parsed files by canonical path, grammar, and SHA-256 content hash. Cached trees use true least-recently-used eviction with limits of 128 files and 32 MiB of retained UTF-8 source bytes. Compiled queries use the same policy with limits of 128 queries and 512 KiB of retained UTF-8 query text. Source and query byte counts are memory-related proxies because `web-tree-sitter` does not report WASM resource sizes. Cached canonical trees stay private in the Worker.

All structural service operations accept optional `CodeRequestControl`. The parent converts cancellation to one shared atomic flag and forwards absolute deadlines. When present, it forwards only the opaque Debug Operation ID through the Worker protocol so parse and query timing events keep direct request ownership. Direct library calls have no ID. Worker read phases observe a local abort signal. Parser and query progress callbacks observe the flag and deadline. If cooperative interruption does not settle in the fixed 250 ms grace period, the parent terminates the Worker. Valid queued work keeps FIFO order on one fresh Worker with cold caches. There is no main-thread parser fallback.

## Source

- `src/api.ts` — public library entrypoint
- `src/index.ts` — re-export surface
- `src/worker/bootstrap.mjs` — package-owned Worker bootstrap and direct `jiti` loader
- `src/worker/runtime.ts` — Worker-only parser and query runtime
- `src/worker/parsed-file-store.ts` — Worker-only parsed-file and compiled-query reuse
- `src/session/structural-worker-client.ts` — bounded FIFO mailbox, protocol, cancellation, and restart ownership
- `src/session/runtime-controller.ts` — generation-fenced shared Worker lifecycle
- `src/session/session.ts` — asynchronous Worker-proxy service and owned session API
- `src/operation-support.ts` — authoritative operation-specific extension support
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/provider/tree-sitter-provider.ts` — `StructuralProvider` adapter consumed by `@mrclrchtr/supi-code-intelligence`
- `src/tool/outline.ts`, `src/tool/outline-*.ts`, `src/tool/imports.ts`, `src/tool/exports.ts`, `src/tool/node-at.ts`, `src/tool/callees.ts`, `src/tool/call-sites.ts` — Worker-internal structural analyses
