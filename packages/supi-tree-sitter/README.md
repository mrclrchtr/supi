# @mrclrchtr/supi-tree-sitter

Structural code analysis for PI — your agent parses code, not just text.

Grep matches strings. Tree-sitter parses structure — functions, classes, imports, call chains. The agent stops pattern-matching and starts understanding your code.

## What you get

### See code structure

Extract functions, classes, interfaces, and methods from any file. The agent knows what lives where without reading every line.

### Trace call chains

Find every function call from a given location. The agent follows the code's actual shape instead of guessing from text proximity.

### 14 languages

JavaScript, TypeScript, Python, Rust, Go, C, C++, Java, Kotlin, Ruby, Bash, HTML, R, SQL — get structural analysis for every project you touch.

Works standalone or alongside LSP. Grammar files are vendored — no native toolchain required at install time.

## Install

```bash
pi install npm:@mrclrchtr/supi-tree-sitter
```

## Quick look

The agent gets a `tree_sitter` tool with these actions:

| Action | What it does |
|--------|-------------|
| `outline` | List functions, classes, interfaces in a file |
| `callees` | Find all function calls from a position |
| `imports` / `exports` | See what a file imports and exports |
| `node_at` | Inspect the AST node at any line/column |
| `query` | Run a custom Tree-sitter query |

`outline`, `imports`, and `exports` are currently JavaScript/TypeScript only. `node_at`, `query`, and `callees` work across all 14 supported languages. Coordinates are 1-based, matching the `lsp` tool convention.

## For extension developers

This package exports a reusable session-scoped parsing service:

```ts
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";

const session = createTreeSitterSession("/project");

// Check if a file is parseable
const result = await session.canParse("src/index.ts");

// Get structural outline
const outline = await session.outline("src/index.ts");

// Trace outgoing calls from a position
const callees = await session.calleesAt("src/index.ts", 42, 10);

// Always clean up
session.dispose();
```

Import from the package root. No internal imports needed. Call `dispose()` when done.
