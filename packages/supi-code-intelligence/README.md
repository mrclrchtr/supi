# @mrclrchtr/supi-code-intelligence

Adds a focused code-understanding toolset to the [pi coding agent](https://github.com/earendil-works/pi).

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

- `code_brief` — interpretive orientation for a project, package, directory, file, or symbol
- `code_map` — factual repo/package/directory inventory
- `code_relations` — callers, callees, or implementations for a resolved target
- `code_affected` — blast radius, downstream impact, and risk for a target
- `code_pattern` — explicit literal, regex, or structured search
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

This package is for questions like:

- what is in this package or directory?
- who calls this symbol?
- what does this function call?
- what is the likely blast radius of a change?
- where is this pattern defined, imported, or exported?

## Tool overview

### `code_brief`
Interpretive orientation. Use for prioritized context, start-here guidance, and project/package/directory/file/symbol overview.

### `code_map`
Strictly factual inventory. Accepts the repo root, a package root, or **any directory path**. Rejects file paths.

### `code_relations`
Relationship tracing tool with:
- `kind: "callers"`
- `kind: "callees"`
- `kind: "implementations"`

`callers` and `implementations` are semantic-only. `callees` is structural-only.

### `code_affected`
Semantic blast-radius analysis for a concrete target. This tool no longer falls back to grep-style guesses.

### `code_pattern`
Explicit search tool for:
- literal search
- regex search (`regex: true`)
- structured search (`kind: "definition" | "export" | "import"`)

This is the only tool in the family that intentionally returns heuristic/text-search results.

## Shared input conventions

Depending on the tool, inputs may include:
- `path`
- `file`
- `line`
- `character`
- `symbol`
- `kind`
- `pattern`
- `regex`
- `exportedOnly`
- `maxResults`
- `contextLines`
- `summary`

Notes:
- line and character positions are **1-based**
- `line` and `character` require `file`, not `path`
- a leading `@` is stripped from `path` and `file`
- non-search tools do **not** silently fall back to heuristic grep behavior

## Result style

Results report confidence such as:

- `semantic`
- `structural`
- `heuristic`
- `unavailable`

`heuristic` is now primarily a `code_pattern` concern. The other tools prefer explicit unavailable states over silent search fallbacks.

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

- `src/code-intelligence.ts` — focused tool registration and session overview injection
- `src/tool/tool-specs.ts` — single source of truth for the public tool surface
- `src/tool/register-tools.ts` — focused tool registration wiring
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/actions/*.ts` — domain implementations
