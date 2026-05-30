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

- `code_context` — task-focused context bundles for a change, question, or resolved target
- `code_brief` — interpretive orientation with structural enrichment for a project, package, directory, file, or symbol
- `code_graph` — unified relation graph (references, callees, implementations) from a resolved target
- `code_affected` — blast radius, downstream impact, and risk for a target
- `code_find` — unified ranked search (text, regex, AST, semantic)
- `code_health` — diagnostics, server status, dirty workspace, coverage, and unused-code health signals
- `code_refactor_plan` — preview an operation-aware semantic refactor plan without mutating files
- `code_refactor_apply` — apply a previously generated, validated precise text-edit refactor plan
- `code_resolve` — resolve human/code references into precise targets with stable target handles for follow-up calls
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

Installing `@mrclrchtr/supi-code-intelligence` activates only the public `code_*` tool surface. `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` remain bundled library substrates that power the semantic and structural parts of that surface.

## V2 workflow roadmap

The workflow-oriented surface is rolling out incrementally.

The current public surface now includes:

- `code_resolve` — **active** (Phase 1)
- `code_context` — **active** (Phase 2, additive alongside `code_brief`)
- `code_find` — **active** (Phase 2a, supersedes code_pattern)
- `code_health` — **active** (Phase 1.5)
- `code_graph` — **active** (Phase 3, supersedes code_references/code_calls/code_implementations)
- `code_impact` — planned (Phase 4)
- `code_refactor` — planned (Phase 5)
- `code_apply` — planned (Phase 5)

The design source of truth lives in `src/workflow/` with types, schemas, and metadata.

This package is for questions like:

- what is in this package or directory?
- where is this symbol referenced?
- what does this function call?
- what are the implementations of this interface?
- what is the likely blast radius of a change?
- where is this pattern defined, imported, or exported?

- `@mrclrchtr/supi-lsp` provides the semantic library substrate used by the public `code_*` tools
- `@mrclrchtr/supi-tree-sitter` provides the structural library substrate used by the public `code_*` tools
- `@mrclrchtr/supi-code-intelligence` owns the public `code_*` tool surface and the orchestration layer above those substrates

## Tool overview

### `code_context`
Task-focused context bundle for a change, question, or resolved target.

- accepts `task`, `targetId`, `scope`, `budget`, `include`, and `maxResults`
- when `task` is omitted, falls back to orientation-style output instead of erroring
- when `task` is present, renders requested sections such as `defs`, `references`, `callees`, `docs`, `tests`, and `diagnostics`
- requested but unavailable sections are called out explicitly instead of being silently omitted
- in this first implementation wave, `code_context` is additive: `code_brief` still exists as the compatibility/orientation tool

### `code_brief`
Interpretive orientation with structural enrichment. Use for prioritized context, start-here guidance, and project/package/directory/file/symbol overview.

When a code provider is available, file briefs include structural context (outline, imports, exports) from tree-sitter and inline diagnostics from LSP. Directory and module briefs include extension breakdown and landmark files. Module briefs show aggregate diagnostics across source files. `maxResults` controls section caps.

### `code_graph`
Unified relation-graph tool. Replaces `code_references`, `code_calls`, and `code_implementations`. Resolves one target and dispatches to the appropriate substrate per requested relation.

- **targetId** (preferred from `code_resolve`) or file+line+character or symbol
- **relations**: `["references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`
- Each relation is best-effort: unavailable substrates skip with a note rather than failing the call
- `imports`, `exports`, `tests` return "not yet implemented" gracefully

### `code_affected`
Semantic blast-radius analysis for a concrete target. This tool no longer falls back to grep-style guesses.

### `code_find`
Unified ranked search tool for:
- literal text search (default mode)
- regex search (`mode: "regex"`)
- AST structured search (`mode: "ast"` with `kind`)
- LSP semantic workspace symbol search (`mode: "semantic"`)

Supports `query` (required), `scope`, `mode`, `kind`, `contextLines`, and `maxResults`.

### `code_health`
Health/status summary for the current workspace or a scoped path.

- defaults to diagnostics + servers when `include` is omitted
- `include` can request `diagnostics`, `servers`, `dirty`, `coverage`, and `unused`
- `coverage` reads `coverage/coverage-summary.json` when present and reports low-coverage files
- `unused` reads `knip.json` when present and reports unused files/exports
- when a requested coverage/unused report is missing, the result says so explicitly instead of silently falling back to diagnostics

### `code_refactor_plan`
Preview-only operation-aware refactor planning.

First-wave supported operations:
- `rename_symbol`
- `update_imports`
- `delete_dead_code`
- legacy `rename` alias → `rename_symbol`

Notes:
- `rename_file` and `move_file` remain explicit unavailable outcomes for now
- only precise semantic text edits become plans
- no files are changed during planning
- `targetId` from `code_resolve` can replace raw file + line + character targeting

### `code_refactor_apply`
Applies a previously generated refactor plan by `planId`.

- applies only stored, validated, precise text-edit plans
- rejects stale plans using file fingerprints
- re-validates ranges and overlap before mutation
- does not yet apply file/resource operations such as `rename_file` or `move_file`

## Shared input conventions

Depending on the tool, inputs may include:
- `path`
- `file`
- `line`
- `character`
- `symbol`
- `kind`
- `exportedOnly`
- `maxResults`
- `contextLines`

Notes:
- line and character positions are **1-based**
- `line` and `character` require `file`, not `path`
- `targetId` (from `code_resolve`) can replace `file` + `line` + `character` in `code_context`, `code_graph`, `code_affected`, `code_brief`, and `code_refactor_plan`
- a leading `@` is stripped from `path` and `file`
- non-search tools do **not** silently fall back to heuristic grep behavior

## Result style

Results report confidence such as:

- `semantic`
- `structural`
- `heuristic`
- `unavailable`

`heuristic` results may appear from `code_find` in text/regex modes. The other tools prefer explicit unavailable states over silent search fallbacks.

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
- `src/use-case/` — typed orchestration modules for brief, context, relations, affected, and pattern
- `src/presentation/markdown/` — markdown renderers that format use-case results, including task-focused context bundles
- `src/targeting/` — typed target-resolution pipeline
- `src/tool/tool-specs.ts` — single source of truth for the current public tool surface
- `src/tool/register-tools.ts` — focused tool registration wiring
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/tool/execute-*.ts` — thin adapters that validate params and route to use-case/presentation layers
- `src/workflow/target-store.ts` — session-scoped target/span handle registry with file-fingerprint staleness detection
- `src/analysis/resolve/service.ts` — `code_resolve` business logic
- `src/tool/execute-resolve.ts` — `code_resolve` public tool executor
- `src/tool/target-id-params.ts` — shared helper for expanding `targetId` into anchored tool params
- `src/presentation/markdown/resolve.ts` — markdown renderer for `code_resolve` results
- `src/workflow/` — Phase 0+ V2 skeleton: planned workflow tool schemas, handle/result contracts, and future-surface metadata
