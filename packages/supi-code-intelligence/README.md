# @mrclrchtr/supi-code-intelligence

Adds a `code_intel` tool to the [pi coding agent](https://github.com/earendil-works/pi) for higher-level codebase analysis.

## Install

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

For local development:

```bash
pi install ./packages/supi-code-intelligence
```

After editing the source, run `/reload`.

## What you get

After install, pi gets:

- `code_intel` — one tool with several analysis actions
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

This package is for questions like:

- what is in this package or directory?
- who calls this symbol?
- what does this function call?
- what is the likely blast radius of a change?
- where is this pattern defined, imported, or exported?

## `code_intel` actions

| Action | What it is for |
| --- | --- |
| `brief` | Generate a project, package, directory, file, or symbol-focused brief |
| `callers` | Find call sites for a symbol, or inspect a file's exported surface |
| `callees` | Show outgoing calls from a symbol using structural analysis |
| `implementations` | Find concrete implementations of an interface or abstract type |
| `affected` | Estimate blast radius, affected files/modules, downstream dependents, and risk |
| `pattern` | Run bounded text search with optional regex mode and structured `kind` filters |
| `index` | Build a factual project map: counts, top-level tree, and landmark files |

## Input shape

The tool accepts a shared parameter set across actions. The main fields are:

- `action`
- `path`
- `file`
- `line`
- `character`
- `symbol`
- `pattern`
- `regex`
- `kind`
- `exportedOnly`
- `maxResults`
- `contextLines`
- `summary`

Notes from the current implementation:

- line and character positions are **1-based**
- `line` and `character` require `file`, not `path`
- `pattern` action `kind` must be `definition`, `export`, or `import`
- a leading `@` is stripped from `path` and `file`

## Result style

Depending on the action and what supporting services are available, results report different confidence modes such as:

- `semantic`
- `structural`
- `heuristic`
- `unavailable`

That lets the model tell the difference between LSP-backed answers, tree-sitter-backed answers, and weaker text-search fallbacks.

## Package surfaces

- `@mrclrchtr/supi-code-intelligence/api` — reusable architecture, brief, and target-resolution helpers
- `@mrclrchtr/supi-code-intelligence/extension` — pi extension entrypoint

Example:

```ts
import { buildArchitectureModel, generateOverview } from "@mrclrchtr/supi-code-intelligence/api";

const model = await buildArchitectureModel("/project");
const overview = generateOverview(model);
```

## Source

- `src/code-intelligence.ts` — tool registration and session overview injection
- `src/tool-actions.ts` — action routing and parameter validation
- `src/actions/*.ts` — per-action implementations
