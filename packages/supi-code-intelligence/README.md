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

- `code_context` — task-focused context bundles for a change, question, or resolved target; also serves orientation overviews for projects, packages, directories, files, or symbols (`code_brief` has been merged into it)
- `code_inspect` — factual point inspection for one precise file position
- `code_graph` — unified relation graph (references, callees, imports, exports, implementations, tests) from a resolved target
- `code_impact` — preferred workflow-oriented blast radius, downstream impact, and diff-aware changed-file analysis
- `code_find` — unified ranked search (text, regex, AST, semantic)
- `code_health` — diagnostics, server status, dirty workspace, coverage, and unused-code health signals
- `code_refactor_plan` — pure planner; preview an operation-aware semantic refactor plan without mutating files
- `code_refactor_apply` — sole mutator; apply a previously stored, validated plan by `planId`
- `code_resolve` — resolve human/code references into precise targets with stable target handles for follow-up calls
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

Installing `@mrclrchtr/supi-code-intelligence` activates only the public `code_*` tool surface. `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` remain bundled library substrates that power the semantic and structural parts of that surface. Historical compatibility executors remain in the source tree for migration/tests, but are no longer registered as public tools.

## Startup performance

LSP language servers start automatically on session open. By default, every server with matching source files in the project is started **concurrently** — in polyglot repos or monorepos with multiple language footprints, this parallel startup can cause a significant CPU spike.

**If you experience high CPU on startup:**

**Disable specific language servers** you don't need by adding per-language opt-outs to your config:

```json
{
  "lsp": {
    "servers": {
      "python": { "enabled": false },
      "rust": { "enabled": false }
    }
  }
}
```

Add this to `.pi/supi/config.json` (project) or `~/.pi/agent/supi/config.json` (global). Only the listed language servers are excluded; all others start normally.

> **Note:** The global `lsp.enabled` switch and `lsp.active` allowlist are deprecated and ignored since v0.7.0. LSP now always attempts to start detected servers. If your config still has `lsp.enabled` or `lsp.active` keys, a one-time deprecation warning will appear at session start, but the keys have no runtime effect.

### Degraded coverage warnings

When the code-intelligence stack cannot provide full coverage for a workspace, you will see:

- **Deprecated key warnings** — if `lsp.enabled` or `lsp.active` are present in your config (ignored keys)
- **Language-scoped semantic warnings** — when a detected language's LSP server binary is missing from PATH, or has been explicitly disabled via `lsp.servers.<language>.enabled: false`
- **Structural warnings** — when Tree-sitter initialization fails (structural coverage unavailable)

These warnings appear once near session start and are also visible in:
- `/supi-ci-status` — the interactive overlay
- `code_health` — the health check tool

## V2 workflow roadmap

The workflow-oriented surface is rolling out incrementally.

The current public surface now includes:

- `code_resolve` — **active** (Phase 1)
- `code_inspect` — **active** (explicit point inspection tool)
- `code_context` — **active** (solo surface for both orientation and task-focused context; `code_brief` merged)
- `code_find` — **active** (Phase 2a, supersedes code_pattern)
- `code_health` — **active** (Phase 1.5)
- `code_graph` — **active** (Phase 3, supersedes code_references/code_calls/code_implementations)
- `code_impact` — **active** (Phase 4, preferred workflow impact tool)
- `code_refactor_plan` — **active** (Phase 5, pure refactor planner)
- `code_refactor_apply` — **active** (Phase 5, refactor plan applier)

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

## Workflow cookbook

### Trace a symbol and prepare a change

1. `code_resolve(query="executeHealthTool")` → capture `targetId`
2. `code_graph(targetId, relations=["references", "callees", "tests"])` → inspect usage
3. `code_impact(targetId, change="add coverage unused section")` → estimate blast radius
4. `code_context(targetId, include=["defs", "tests"])` → gather edit context
5. Edit files, then `code_health(scope="packages/...", refresh=true)` → verify diagnostics

### Understand a package before editing

1. `code_context(scope="packages/supi-code-intelligence")` → package orientation
2. `code_context(scope="packages/supi-code-intelligence/src/tool")` → directory drill-down
3. `code_context(scope="packages/.../execute-graph.ts")` → file overview

### Safe refactoring

1. `code_resolve(query="oldFunctionName")` → capture `targetId`
2. `code_graph(targetId, relations=["references"])` → confirm scope
3. `code_refactor_plan(targetId, operation="rename_symbol", newName="newFunctionName")` → preview plan
4. `code_refactor_apply(planId)` → apply after reviewing the plan

## Tool overview

### `code_context`
Task-focused context bundle for a change, question, or resolved target.

- accepts `task`, `targetId`, `scope`, `budget`, `include`, and `maxResults`
- when `task` is omitted, falls back to orientation-style output instead of erroring
- when `task` is present, renders requested sections such as `defs`, `references`, `callees`, `docs`, `tests`, and `diagnostics`
- requested but unavailable sections are called out explicitly instead of being silently omitted
- in this first implementation wave, `code_context` is the solo surface: `code_brief` has been removed from the public surface

### `code_inspect`
Factual point-inspection tool for one precise file position.

- requires `file`, `line`, and `character`
- returns best-effort syntax, enclosing symbol, hover/type info, definition target(s), nearby diagnostics, and code-action titles
- stays honest when providers are missing by rendering explicit unavailable sections instead of heuristic guesses
- keeps diagnostics summary/refresh on `code_health`; `code_inspect` only reports local facts near the inspected point

### `code_graph`
Unified relation-graph tool. Replaces `code_references`, `code_calls`, and `code_implementations`. Resolves one target and dispatches to the appropriate substrate per requested relation.

- **targetId** (preferred from `code_resolve`) or file+line+character or symbol
- **relations**: `["all", "references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`; use `["all"]` for the full graph in one call
- Each relation is best-effort: unavailable substrates skip with a note rather than failing the call
- **Each relation annotates its evidence source** in the output. For the `tests` relation, provenance describes **file discovery only** — `semantic+conventions` means semantic references contributed, `conventions-only` means only deterministic path/layout conventions contributed.
- Test-producing surfaces also include a small structured tests metadata shape in tool details: discovery status/provenance plus per-file label status and extracted labels.
- `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion tests using semantic import/reference evidence plus deterministic package-layout conventions (`__tests__/unit/…`, `__tests__/integration/…`)
- Test-label extraction is tracked separately from discovery provenance. When a discovered test file has no recognized `describe` / `it` / `test` / `spec` blocks, user-facing output shows `_(no recognized test blocks)_` intentionally instead of helper or variable names.
- Bounded package/tool-aware candidates are generated for source files at `src/tool/execute-<name>.ts`. Exact candidates such as `code-<name>-tool.test.ts`, `<name>-tool.test.ts`, and `execute-<name>.test.ts` are checked in both `__tests__/unit/` and `__tests__/integration/`. No broad search, fuzzy matching, or AI guessing is performed.

### `code_impact`
Preferred workflow-oriented impact analysis.

- supports the existing target-based path (`targetId`, anchored coords, symbol)
- adds diff-aware entry points for `changedFiles` and explicit `includeTests`
- `includeTests` uses the same shared test discovery as `code_graph` and `code_context` (import/reference evidence plus package-layout conventions)
- **Target-based analysis** uses semantic references and fails explicitly when no LSP provider is available
- **changedFiles analysis** uses structural evidence by default and, when LSP/export data is available, merges semantic references for symbols defined in changed files. Evidence is annotated as either `**Evidence: structural**` or `**Evidence: semantic+structural**`.
- **test list annotations** — when likely tests are shown, impact headings annotate discovery provenance explicitly (`Likely Tests (semantic+conventions)` or `Likely Tests (conventions-only)`)
- **explicit empty-test note** — when `includeTests: true` is set and bounded companion/package discovery completes without finding any test files, an explicit `No likely tests found by bounded companion/package discovery.` note appears instead of silently omitting test information. This note is not shown when `includeTests` is omitted or unavailable.
- **target-based analysis seeds the target file itself** — zero-reference targets still report affected evidence and likely tests
- when the workspace clearly uses Vitest, likely test files also come with concrete `pnpm vitest run … --reporter=verbose` commands
- `change`-only requests stay honest and return an explicit insufficient-evidence result instead of heuristic guessing
- uses real workspace/git evidence only; no heuristic grep fallback

### `code_find`
Unified ranked search tool with a strict evidence contract.

- omitted `mode` or `mode: "text"` → literal text search; `kind` is not accepted
- `mode: "regex"` → ripgrep regex search; `kind` is not accepted
- `mode: "semantic"` → LSP workspace symbol search; `kind` is not accepted and semantic mode does not fall back to text search
- `mode: "ast"` → tree-sitter structured search; requires explicit `kind`
- supported AST kinds: `definition`, `import`, `export`, `call`, `type`, `interface`
- unsupported mode/kind combinations fail explicitly instead of being broadened into best-effort search

Supports `query` (required), `scope`, `mode`, `kind`, `contextLines`, and `maxResults`.

### `code_health`
Health/status summary for the current workspace or a scoped path.

- defaults to diagnostics + servers when `include` is omitted
- `include` can request `diagnostics`, `servers`, `dirty`, `coverage`, and `unused`
- `coverage` reads `coverage/coverage-summary.json` when present and reports low-coverage files
- `unused` reads `knip.json` when present and reports unused files/exports
- when a requested coverage/unused report is missing, the result says so explicitly instead of silently falling back to diagnostics

### `code_refactor_plan`
Pure refactor planner.

- previews a precise semantic refactor plan without mutating files
- returns a `planId` for follow-up `code_refactor_apply`
- uses the workflow schema (`operation`, target/file coords, optional selected `range`, and operation-specific fields)
- legacy `operation: "rename"` is accepted as a compatibility alias for `rename_symbol`
- extract operations require a 1-based `range`, `newName`, and an LSP code action that returns precise text edits

Supported operations:
- `rename_symbol`
- `extract_function`
- `extract_variable`

Notes:
- only precise semantic text edits become plans
- `targetId` from `code_resolve` can replace raw file + line + character targeting
- this tool never mutates files

### `code_refactor_apply`
Sole mutator in the refactor workflow.

- applies a previously stored plan by `planId`
- rejects stale plans using file fingerprints and re-validates ranges/overlap before mutation
- this is the only tool in the refactor workflow that writes files

## Internal compatibility paths

The legacy compatibility executor (`code_affected`) remains in the source tree for migration/tests, but is no longer registered on the public tool surface.

## Shared input conventions

Depending on the tool, inputs may include:
- `scope`
- `file`
- `line`
- `character`
- `query`
- `symbol`
- `kind`
- `targetId`
- `changedFiles`
- `includeTests`
- `maxResults`
- `contextLines`

Notes:
- line and character positions are **1-based**
- `line` and `character` require `file`, not `scope`
- `code_inspect` is the public point-inspection tool for `file` + `line` + `character`
- `targetId` (from `code_resolve`) can replace raw coordinates in `code_context`, `code_graph`, `code_impact`, and `code_refactor_plan`
- `scope` and `file` use pi-style paths: a leading `@` is stripped, relative paths resolve from the current cwd, and existing file scopes match only that file while directory scopes match descendants
- non-search tools do **not** silently fall back to heuristic grep behavior

### Target handle lifecycle

- `targetId` handles are session-scoped; they are valid only within the current agent session.
- A handle becomes stale when its backing file is modified and the stored fingerprint no longer matches. Stale handles return an explicit error — re-run `code_resolve` to obtain a fresh handle.
- Handles have no cross-session persistence; a new session resolves targets fresh.
- `planId` handles follow the same session-scoped, fingerprint-checked lifecycle. See `docs/adr/0002-refactor-planner-applier-split.md` for the planner/applier invariant.

## Result style

Results report evidence provenance such as:

- `semantic` — backed by LSP/semantic provider
- `structural` — backed by tree-sitter/structural provider
- `heuristic` — pattern-based, may include false positives
- `unavailable` — the required provider or substrate was absent

`heuristic` results may appear from `code_find` in text/regex modes. The other tools prefer explicit unavailable states over silent search fallbacks.

**Evidence-strictness principle:** Every tool result that depends on LSP or TreeSitter explicitly declares its evidence source. For test discovery, provenance describes how companion test files were found: `semantic+conventions` means semantic references contributed, `conventions-only` means only path-based conventions ran. Test-label extraction is a separate concern; `_(no recognized test blocks)_` is an intentional honest placeholder, not silent degradation.

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
- `src/use-case/` — typed orchestration modules for brief, inspect, context, relations, affected, and pattern
- `src/presentation/markdown/` — markdown renderers that format use-case results, including inspect and task-focused context bundles
- `src/targeting/` — typed target-resolution pipeline
- `src/tool/tool-specs.ts` — single source of truth for the current public tool surface
- `src/tool/register-tools.ts` — focused tool registration wiring
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/tool/execute-*.ts` — thin adapters that validate params and route to use-case/presentation layers, including the Phase 5 workflow wrappers `execute-refactor.ts` and `execute-apply.ts`
- `src/workflow/target-store.ts` — session-scoped target/span handle registry with file-fingerprint staleness detection
- `src/analysis/resolve/service.ts` — `code_resolve` business logic
- `src/tool/execute-resolve.ts` — `code_resolve` public tool executor
- `src/tool/target-id-params.ts` — shared helper for expanding `targetId` into anchored tool params
- `src/presentation/markdown/resolve.ts` — markdown renderer for `code_resolve` results
- `src/workflow/` — Phase 0+ V2 skeleton: planned workflow tool schemas, handle/result contracts, and future-surface metadata
