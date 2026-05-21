# @mrclrchtr/supi-tree-sitter

Adds a `tree_sitter` tool to the [pi coding agent](https://github.com/earendil-works/pi) for parser-based structural code analysis.

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

After install, pi gets one tool:

- `tree_sitter` — inspect code structure through Tree-sitter parsers instead of plain text search

## `tree_sitter` actions

| Action | What it is for | Current language coverage |
| --- | --- | --- |
| `outline` | List structural declarations such as functions, classes, interfaces, and methods | JavaScript / TypeScript only |
| `imports` | List import statements | JavaScript / TypeScript only |
| `exports` | List export declarations, re-exports, and export assignments | JavaScript / TypeScript only |
| `node_at` | Show the syntax node at a position, including ancestry | Any supported grammar |
| `query` | Run a custom Tree-sitter query against a file | Any supported grammar |
| `callees` | Find outgoing calls from the enclosing function or method at a position | Supported for most grammars, but not all |

Coordinates use **1-based** line and character columns. Character positions use UTF-16 code units. Relative paths resolve from the session cwd, and a leading `@` on file paths is stripped.

## Supported file families

The current tool description covers:

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

- `src/tree-sitter.ts` — tool registration and action handling
- `src/session/runtime.ts` — parser and query runtime
- `src/session/session.ts` — runtime-backed service helpers and owned session API
- `src/session/service-registry.ts` — shared session-scoped structural service registry
- `src/tool/outline.ts`, `src/tool/imports.ts`, `src/tool/exports.ts`, `src/tool/node-at.ts`, `src/tool/callees.ts` — structural analyses
