<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-tree-sitter">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-tree-sitter/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-tree-sitter

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
- structural extraction helpers for outline/import/export/node/callee/call-site analysis inside the library surface
- operation-specific extension discovery through `getStructuralSearchSupportedExtensions()`

It does **not** register pi tools or commands on its own.

Coordinates in the library APIs use **1-based** line and character columns. Character positions use UTF-16 code units. Relative paths resolve from the session cwd, and a leading `@` on file paths is stripped.

## Supported file families

- JavaScript / TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`)
- Python (`.py`, `.pyi`)
- Rust (`.rs`)
- Go (`.go`, `.mod`)
- C / C++ (`.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`)
- Java (`.java`)
- Kotlin (`.kt`, `.kts`)
- Ruby (`.rb`)
- Bash / shell (`.sh`, `.bash`, `.zsh`)
- HTML (`.html`, `.htm`, `.xhtml`)
- R (`.r`)
- SQL (`.sql`)

Outline collection supports every listed family. HTML outlines contain elements with non-empty `id` attributes; SQL outlines contain `CREATE` declarations and shallow table/type members. Import and export collection remains JavaScript/TypeScript-only, and call-site collection supports every listed family except HTML and SQL. Consumers performing a bulk structural scan should use `getStructuralSearchSupportedExtensions(operation)` rather than treating parser support as operation support.

## Architecture

`@mrclrchtr/supi-tree-sitter` is the **structural substrate** in SuPi's
code-understanding stack. It depends on `@mrclrchtr/supi-core` and
`@mrclrchtr/supi-code-runtime` for shared contracts, and provides structural
analysis via a session-scoped Tree-sitter service that publishes its
capabilities into the shared workspace runtime.

```text
supi-code-runtime  ← shared contracts + workspace runtime
    ↑
supi-tree-sitter  ← Tree-sitter WASM + session-scoped service + runtime capabilities
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

session.dispose();
```

Shared session-scoped service example:

```ts
import { getSessionTreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";

const state = getSessionTreeSitterService("/project");
if (state.kind === "ready") {
  const outline = await state.service.outline("src/index.ts");
}
```

## Source

- `src/api.ts` — public library entrypoint
- `src/index.ts` — re-export surface
- `src/session/runtime.ts` — parser and query runtime
- `src/session/session.ts` — runtime-backed service helpers and owned session API
- `src/operation-support.ts` — authoritative operation-specific extension support
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/provider/tree-sitter-provider.ts` — `StructuralProvider` adapter consumed by `@mrclrchtr/supi-code-intelligence`
- `src/tool/outline.ts`, `src/tool/outline-*.ts`, `src/tool/imports.ts`, `src/tool/exports.ts`, `src/tool/node-at.ts`, `src/tool/callees.ts`, `src/tool/call-sites.ts` — structural analyses exposed through the library surface
