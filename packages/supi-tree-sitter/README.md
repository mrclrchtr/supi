# @mrclrchtr/supi-tree-sitter

Adds focused structural code analysis tools to the [pi coding agent](https://github.com/earendil-works/pi) using Tree-sitter parsers.

## Install

```bash
pi install npm:@mrclrchtr/supi-tree-sitter
```

For local development:

```bash
pi install ./packages/supi-tree-sitter
```

After editing the source, run `/reload`.

## What you get

After install, pi gets **6 focused tools** for parser-based structural analysis:

- `tree_sitter_outline` — shallow structural outline of declarations in JavaScript/TypeScript files
- `tree_sitter_imports` — list imports in JavaScript/TypeScript files
- `tree_sitter_exports` — list exports in JavaScript/TypeScript files
- `tree_sitter_node_at` — find the exact syntax node and ancestry at a position (any supported grammar)
- `tree_sitter_query` — run a custom Tree-sitter query against a file (any supported grammar)
- `tree_sitter_callees` — find outgoing calls from the enclosing function or method at a position (most grammars)

### Outline, imports, exports

These three tools work on JavaScript, TypeScript, JSX, and TSX files. They provide parser-level structural information without needing a language server:

- `tree_sitter_outline` — top-level declarations plus class/interface/enum members
- `tree_sitter_imports` — module specifiers and source locations for each import
- `tree_sitter_exports` — kind, name, and module specifier (for re-exports) of each export

### Node-at, query, callees

These tools work across all or most supported grammars:

- `tree_sitter_node_at` — exact syntax node type and ancestry at a given file position
- `tree_sitter_query` — custom Tree-sitter query pattern matching on any supported grammar
- `tree_sitter_callees` — outgoing calls from the enclosing function or method at a given position

Coordinates use **1-based** line and character columns. Character positions use UTF-16 code units. Relative paths resolve from the session cwd, and a leading `@` on file paths is stripped.

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

## Package surfaces

- `@mrclrchtr/supi-tree-sitter/api` — reusable parsing session factory, shared session-scoped structural service access, and shared result types
- `@mrclrchtr/supi-tree-sitter/extension` — pi extension entrypoint

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

- `src/tool/tool-specs.ts` — single source of truth for the public tool surface
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/tool/register-tools.ts` — focused tool registration driven by tool specs
- `src/tree-sitter.ts` — extension entrypoint (thin wire-up)
- `src/session/runtime.ts` — parser and query runtime
- `src/session/session.ts` — runtime-backed service helpers and owned session API
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/tool/outline.ts`, `src/tool/imports.ts`, `src/tool/exports.ts`, `src/tool/node-at.ts`, `src/tool/callees.ts` — structural analyses
