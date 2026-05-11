# @mrclrchtr/supi-tree-sitter

Tree-sitter structural analysis for the [pi coding agent](https://github.com/earendil-works/pi).

This package registers a `tree_sitter` tool and also exports a small TypeScript service API for other SuPi extensions. It is designed as a standalone structural-analysis substrate: it does not depend on `supi-lsp` or semantic language-server tooling, and it remains correct and useful when installed by itself.

## Install

```bash
pi install npm:@mrclrchtr/supi-tree-sitter
```

Standalone installs include the runtime grammar dependencies needed for the supported non-vendored languages. Kotlin and SQL use vendored WASM grammars bundled with this package.

It is also bundled by the full SuPi meta-package:

```bash
pi install npm:@mrclrchtr/supi
```

## Supported files

The runtime can parse these file families:

- **JavaScript / TypeScript** — `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`
- **Python** — `.py`, `.pyi`
- **Rust** — `.rs`
- **Go** — `.go`, `.mod`
- **C / C++** — `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++`
- **Java** — `.java`
- **Kotlin** — `.kt`, `.kts`
- **Ruby** — `.rb`
- **Bash / Shell** — `.sh`, `.bash`, `.zsh`
- **HTML** — `.html`, `.htm`, `.xhtml`
- **R** — `.r`
- **SQL** — `.sql`

Grammar `.wasm` files are resolved from installed package metadata for npm-shipped grammars, not from repository-relative paths.

## `tree_sitter` tool

Actions:

- `outline` — list structural declarations such as functions, classes, interfaces, methods, and variables (**currently JavaScript / TypeScript only**)
- `imports` — list import statements and module specifiers (**currently JavaScript / TypeScript only**)
- `exports` — list exported declarations, re-exports, and TypeScript `export =` assignments (**currently JavaScript / TypeScript only**)
- `node_at` — return the smallest syntax node at a 1-based `line`/`character` position, plus ancestry (all supported grammars)
- `query` — run a custom Tree-sitter query and return captures (all supported grammars)
- `callees` — find outgoing function/method calls from a position; supports all grammars with a callee query configured

Coordinates are 1-based and compatible with the `lsp` tool. `character` is a UTF-16 code-unit column. Relative file paths resolve from the pi session working directory.

Large result sets are capped at 100 emitted items per tool response. For outlines, nested children count toward the same cap so deeply nested classes do not bypass the limit.

## Service API

```ts
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";

const session = createTreeSitterSession(process.cwd());
try {
  const parseable = await session.canParse("src/index.ts");
  if (parseable.kind === "success") {
    console.log(parseable.data.file, parseable.data.language);
  }

  const outline = await session.outline("src/index.ts");
  if (outline.kind === "success") {
    console.log(outline.data);
  }

  const callees = await session.calleesAt("src/index.ts", 1, 10);
  if (callees.kind === "success") {
    console.log(callees.data.enclosingScope.name, callees.data.callees);
  }
} finally {
  session.dispose();
}
```

`canParse(file)` validates that a supported file can be read and parsed, then returns the resolved file path and grammar id. It does not expose the raw Tree-sitter tree; use `outline`, `query`, `imports`, `exports`, `nodeAt`, or `calleesAt` for structured results.

`calleesAt(file, line, character)` extracts structural outgoing calls from the enclosing function/method scope at the given position. It returns the enclosing scope name and a deduplicated list of callees with their source ranges.

Exported types include `TreeSitterResult`, `TreeSitterSession`, `OutlineItem`, `ImportRecord`, `ExportRecord`, `NodeAtResult`, `QueryCapture`, `CalleesAtResult`, `SourceRange`, `GrammarId`, and `SupportedExtension`.

Always call `dispose()` when the session is no longer needed. The runtime lazily initializes grammars, reuses parser instances within a session, deduplicates concurrent first-use grammar initialization, and retries after initialization failures.

## Positioning

`supi-tree-sitter` is the structural-analysis substrate in SuPi's layered code-understanding stack:

- `supi-tree-sitter` — parser-backed structural analysis (this package)
- `supi-lsp` — live semantic analysis through language servers
- `supi-code-intelligence` — higher-level agent-facing analysis built on top of both substrates

Each substrate can be installed and used independently. `supi-tree-sitter` does not require `supi-lsp` to be present, and its prompt guidance is written so it remains correct in standalone installs.
