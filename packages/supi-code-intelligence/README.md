<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-intelligence">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

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

![Code brief in action](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-code-intelligence.png)

## What you get

After install, pi gets:

- `code_brief` — interpretive orientation with structural enrichment for a project, package, directory, file, or symbol
- `code_references` — semantic references/usages for a resolved target
- `code_calls` — structural outgoing calls from an enclosing function or method
- `code_implementations` — semantic implementation lookup for an interface, class, or method
- `code_affected` — blast radius, downstream impact, and risk for a target
- `code_pattern` — explicit literal, regex, or structured search
- `code_refactor_plan` — preview a semantic rename without mutating files
- `code_refactor_apply` — apply a previously generated refactor plan
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- **all `lsp_*` expert tools** from `@mrclrchtr/supi-lsp` (hover, definition, references, implementation, diagnostics, rename, code actions, recover, document/workspace symbols)
- **all `tree_sitter_*` expert tools** from `@mrclrchtr/supi-tree-sitter` (outline, imports, exports, node-at, query, callees)
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

Installing `@mrclrchtr/supi-code-intelligence` activates all three tool families. Each family is owned and documented by its own package:

This package is for questions like:

- what is in this package or directory?
- where is this symbol referenced?
- what does this function call?
- what are the implementations of this interface?
- what is the likely blast radius of a change?
- where is this pattern defined, imported, or exported?

- `@mrclrchtr/supi-lsp` owns the semantic `lsp_*` tools
- `@mrclrchtr/supi-tree-sitter` owns the structural `tree_sitter_*` tools
- `@mrclrchtr/supi-code-intelligence` owns the analysis `code_*` tools and provides cross-family orchestration guidance

## Tool overview

### `code_brief`
Interpretive orientation with structural enrichment. Use for prioritized context, start-here guidance, and project/package/directory/file/symbol overview.

When a code provider is available, file briefs include structural context (outline, imports, exports) from tree-sitter and inline diagnostics from LSP. Directory and module briefs include extension breakdown and landmark files. Module briefs show aggregate diagnostics across source files. `maxResults` controls section caps.

### `code_references`
Semantic usages of a resolved target. Uses LSP references. Reports references, not call sites.

### `code_calls`
Structural outgoing calls from the enclosing function or method. Requires anchored coordinates (`file`, `line`, `character`).

### `code_implementations`
Semantic implementation lookup for an interface, class, or abstract method.

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

## Architecture

`@mrclrchtr/supi-code-intelligence` is the **orchestration layer** that consumes
semantic and structural providers through the shared workspace broker and routes
user intents through a planner.

```text
supi-code-runtime      ← shared broker + canonical provider/result contracts
        ↑
supi-lsp / supi-tree-sitter
 (semantic)   (structural)
        ↑
supi-code-intelligence ← planner, presentation, code_* tools
```

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

- `src/code-intelligence.ts` — extension entry point: overview injection and tool registration
- `src/use-case/` — typed orchestration modules for brief, relations, affected, and pattern
- `src/presentation/markdown/` — markdown renderers that format use-case results
- `src/targeting/` — typed target-resolution pipeline
- `src/tool/tool-specs.ts` — single source of truth for the public tool surface
- `src/tool/register-tools.ts` — focused tool registration wiring
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/tool/execute-*.ts` — thin adapters that validate params and route to use-case/presentation layers
