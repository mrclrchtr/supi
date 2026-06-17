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
- `code_graph` — unified relation graph (references, callees, implementations) from a resolved target
- `code_impact` — preferred workflow-oriented blast radius, downstream impact, and diff-aware changed-file analysis
- `code_find` — unified ranked search (text, regex, AST, semantic)
- `code_health` — diagnostics, server status, dirty workspace, coverage, and unused-code health signals
- `code_refactor` — preferred workflow refactor surface; preview an operation-aware semantic refactor plan without mutating files
- `code_apply` — preferred workflow apply surface; apply a previously stored, validated plan by `planId`
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
- `code_refactor` — **active** (Phase 5, preferred workflow refactor surface)
- `code_apply` — **active** (Phase 5, preferred workflow apply surface)

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
- **relations**: `["references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`
- Each relation is best-effort: unavailable substrates skip with a note rather than failing the call
- **Each relation annotates its evidence source** in the output. For the `tests` relation, provenance describes **file discovery only** — `semantic+conventions` means semantic references contributed, `conventions-only` means only deterministic path/layout conventions contributed.
- Test-producing surfaces also include a small structured tests metadata shape in tool details: discovery status/provenance plus per-file label status and extracted labels.
- `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion tests using semantic import/reference evidence plus deterministic package-layout conventions (`__tests__/unit/…`, `__tests__/integration/…`)
- Test-label extraction is tracked separately from discovery provenance. When a discovered test file has no recognized `describe` / `it` / `test` / `spec` blocks, user-facing output shows `_(no recognized test blocks)_` intentionally instead of helper or variable names.

### `code_impact`
Preferred workflow-oriented impact analysis.

- supports the existing target-based path (`targetId`, anchored coords, symbol)
- adds diff-aware entry points for `changedFiles` and explicit `includeTests`
- `includeTests` uses the same shared test discovery as `code_graph` and `code_context` (import/reference evidence plus package-layout conventions)
- **Target-based analysis** uses semantic references and fails explicitly when no LSP provider is available
- **changedFiles analysis** uses structural evidence only (file-level module analysis, path-based test discovery) and always annotates its evidence: `**Evidence: structural** — impact limited to file-level module analysis and path-based test discovery. Use \`code_resolve\` for semantic impact.`
- **test list annotations** — when likely tests are shown, impact headings annotate discovery provenance explicitly (`Likely Tests (semantic+conventions)` or `Likely Tests (conventions-only)`)
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
- supported AST kinds in this phase: `definition`, `import`, `export`, `call`
- unsupported mode/kind combinations fail explicitly instead of being broadened into best-effort search

Supports `query` (required), `scope`, `mode`, `kind`, `contextLines`, and `maxResults`.

### `code_health`
Health/status summary for the current workspace or a scoped path.

- defaults to diagnostics + servers when `include` is omitted
- `include` can request `diagnostics`, `servers`, `dirty`, `coverage`, and `unused`
- `coverage` reads `coverage/coverage-summary.json` when present and reports low-coverage files
- `unused` reads `knip.json` when present and reports unused files/exports
- when a requested coverage/unused report is missing, the result says so explicitly instead of silently falling back to diagnostics

### `code_refactor`
Preferred workflow refactor surface.

- previews a precise semantic refactor plan without mutating files
- returns a `planId` for follow-up `code_apply`
- uses the workflow schema (`operation`, target/file coords, operation-specific fields)
- legacy `operation: "rename"` is accepted as a compatibility alias for `rename_symbol`
- `preview: false` is not yet supported; `code_refactor` remains preview-only in this phase
- in this phase it intentionally wraps the proven `code_refactor_plan` machinery

Supported operation in this phase:
- `rename_symbol`

Notes:
- only precise semantic text edits become plans
- `targetId` from `code_resolve` can replace raw file + line + character targeting

### `code_apply`
Preferred workflow apply surface.

- applies a previously stored plan by `planId`
- supports `mode: "apply"` in this phase
- rejects stale plans using file fingerprints and re-validates ranges/overlap before mutation

## Internal compatibility paths

The legacy compatibility executors (`code_affected`, `code_refactor_plan`, `code_refactor_apply`) remain in the source tree for migration/tests, but are no longer registered on the public tool surface.

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
- `targetId` (from `code_resolve`) can replace raw coordinates in `code_context`, `code_graph`, `code_impact`, and `code_refactor`
- a leading `@` is stripped from `scope` and `file`
- non-search tools do **not** silently fall back to heuristic grep behavior

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
