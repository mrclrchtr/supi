# @mrclrchtr/supi-tree-sitter

Tree-sitter structural analysis for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

This package registers a `tree_sitter` tool and also exports a small TypeScript service API for other SuPi extensions.

## Install

```bash
pi install npm:@mrclrchtr/supi-tree-sitter
```

It is also bundled by the full SuPi meta-package:

```bash
pi install npm:@mrclrchtr/supi
```

## Supported files

The v1 runtime supports the JavaScript and TypeScript file family:

- `.ts`, `.tsx`, `.mts`, `.cts`
- `.js`, `.jsx`, `.mjs`, `.cjs`

It uses `web-tree-sitter` plus the npm grammar packages `tree-sitter-javascript` and `tree-sitter-typescript`. Grammar `.wasm` files are resolved from installed package metadata, not from repository-relative paths.

## `tree_sitter` tool

Actions:

- `outline` — list structural declarations such as functions, classes, interfaces, methods, and variables
- `imports` — list import statements and module specifiers
- `exports` — list exported declarations, re-exports, and TypeScript `export =` assignments
- `node_at` — return the smallest syntax node at a 1-based `line`/`character` position, plus ancestry
- `query` — run a custom Tree-sitter query and return captures

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
} finally {
  session.dispose();
}
```

`canParse(file)` validates that a supported file can be read and parsed, then returns the resolved file path and grammar id. It does not expose the raw Tree-sitter tree; use `outline`, `query`, `imports`, `exports`, or `nodeAt` for structured results.

Exported types include `TreeSitterResult`, `TreeSitterSession`, `OutlineItem`, `ImportRecord`, `ExportRecord`, `NodeAtResult`, `QueryCapture`, `SourceRange`, `GrammarId`, and `SupportedExtension`.

Always call `dispose()` when the session is no longer needed. The runtime lazily initializes grammars, reuses parser instances within a session, deduplicates concurrent first-use grammar initialization, and retries after initialization failures.
