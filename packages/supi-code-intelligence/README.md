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

- `code_orientation` — first-pass orientation for projects, discovered modules, directories, files, or precise symbols (`code_brief` and the old `code_context` surface have been replaced)
- `code_inspect` — factual point inspection for one precise file position
- `code_graph` — unified relation graph (references, callees, imports, exports, implementations, tests) from a resolved target
- `code_impact` — preferred workflow-oriented blast radius, downstream impact, and user-supplied change-set analysis
- `code_find` — unified ranked search (text, regex, AST, semantic)
- `code_health` — diagnostics, server status, dirty workspace, coverage, and unused-code health signals
- `code_refactor_plan` — pure planner; preview an operation-aware semantic refactor plan without mutating files
- `code_refactor_apply` — sole mutator; apply a previously stored, validated plan by `planId`
- `code_resolve` — resolve human/code references into precise targets with stable target handles for follow-up calls
- a lightweight hidden architecture overview injected near the start of a session when a project model can be built
- bundled support from `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`

## Coming from standard tools?

| Standard approach | `code_*` equivalent |
|---|---|
| `rg "symbol" --type ts` | `code_resolve(query="symbol")` → `code_graph(targetId, relations=["references"])` |
| `read` + manual symbol tracing | `code_inspect(file, line, character)` for point facts, then `read` the suggested source range |
| manual dependency/reference tracing | `code_graph(targetId, relations=["references", "callees", "tests"])` |
| `git status` + diagnostics commands | `code_health(refresh=true, include=["diagnostics", "servers", "dirty"])` |
| `rg` + counting + intuition | `code_impact(targetId, change="...")` or `code_impact(changeSetFiles=[...])` |
| `rg` for defs/imports/exports | `code_find(mode="ast", kind="definition")` |
| Multi-file find-and-replace | `code_refactor_plan` → review → `code_refactor_apply` |
| `ls` + `read` to explore a package | `code_orientation(focus="packages/...")`, then inspect identified entrypoints |
| `rg "symbolName"` (ambiguous) | `code_resolve(query="symbolName")` |

> 💡 **Key insight:** `code_resolve` → `targetId` → `code_graph`/`code_orientation`/`code_impact` is the core chained workflow. `code_*` tools summarize and prioritize; use `read` on the suggested ranges before editing.

## Standard-tools cookbook

### Find references to a symbol

Standard:
```bash
rg -n "myFunction" packages/my-package
```
Then manually separate declarations, docs, imports, and actual symbol uses.

Code intelligence:
```text
code_resolve(query="myFunction", scope="packages/my-package") → targetId
code_graph(targetId, relations=["references", "tests"])
```
Use the `Read Next` section to inspect the resolved target or top reference sites.

### Understand a package or module

Standard:
```bash
find packages/my-package -maxdepth 3 -type f
cat packages/my-package/package.json
```
Then read likely entrypoints by hand.

Code intelligence:
```text
code_orientation(focus="packages/my-package")
code_orientation(focus="packages/my-package/src/tool")
code_orientation(focus="packages/my-package/src/tool/execute-health.ts")
```
Orientation briefs are summaries, not source replacement; read the files before editing.

### Estimate impact before a change

Standard: run `rg`, inspect consumers, infer test files, and decide risk manually.

Code intelligence:
```text
code_resolve(query="myFunction") → targetId
code_impact(targetId, change="change output formatting", includeTests=true)
```
For already-known files, use `code_impact(changeSetFiles=["packages/.../file.ts"], includeTests=true)`.

### Check health quickly

Standard: combine editor diagnostics, `git status`, coverage files, and project commands.

Code intelligence:
```text
code_health(refresh=true, include=["diagnostics", "servers", "dirty"])
code_health(include=["coverage", "unused"])
```
`code_health` is a quick status surface; it does not replace the project's required verification commands after edits.

## Quick start — three most common workflows

### Find references and trace usage
```
code_resolve(query="myFunction")              → capture targetId
code_graph(targetId, relations=["references"]) → inspect usage
code_orientation(targetId)                       → orient around the symbol
```

### Understand a package before editing
```
code_orientation(focus="packages/my-package")           → package orientation
code_orientation(focus="packages/my-package/src/tool")   → directory drill-down
code_health(scope="packages/my-package", refresh=true) → check diagnostics
```

### Safe rename refactoring
```
code_resolve(query="oldName")                                  → capture targetId
code_impact(targetId, change="rename to newName")              → estimate blast radius
code_refactor_plan(targetId, operation="rename_symbol", newName="newName") → preview
code_refactor_apply(planId)                                     → apply
```

## ⚠️ `targetId` lifecycle — essential for chained workflows

> 💡 **Every chained workflow — references, impact, refactoring — flows through `targetId`. Spend 30 seconds here.**

`targetId` handles are the backbone of the chained workflow:

- **Session-scoped** — handles live only within the current agent session. A new session resolves targets fresh.
- **Fingerprint-gated** — when the backing file is modified, the stored fingerprint no longer matches and the handle becomes stale. Re-run `code_resolve` to obtain a fresh handle.
- **Content-hash based** — `targetId`s are derived from the symbol's name, kind, container, and file fingerprint (position is excluded). Re-resolving the same symbol across reloads produces the same ID.
- **No cross-session persistence** — `planId` handles follow the same lifecycle.

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ code_resolve │ ──→ │  targetId    │ ──→ │ code_graph  │
│              │     │  (stable)    │     │ code_orientation│
└─────────────┘     └──────────────┘     │ code_impact │
       ↑                  │              └─────────────┘
       │  re-resolve       │  stale after
       └───────────────────┘  file edit
```

## When each tool won't help you

- **No silent fallback:** non-search tools do not silently turn semantic requests into grep. If the required provider is unavailable, results say so or the tool errors.
- **LSP warmup/provider gaps:** `code_resolve` symbol queries, semantic `code_find`, references, implementations, impact, and refactor planning need an active semantic/LSP provider. Retry after warmup or check `code_health`.
- **Tree-sitter/structural gaps:** AST `code_find`, callees, imports, exports, outlines, and structural test-label extraction need the structural provider.
- **`code_graph` callees** — won't find calls inside nested functions, callbacks, or method bodies unless `calleeDepth: "deep"` is requested. Callees are structural source-shape evidence, not symbol identity.
- **`code_find` semantic mode** — fails when no LSP provider is active. It does not fall back to text search — use `mode: "text"` explicitly.
- **`code_refactor_plan`** — requires LSP precise edit support. When the LSP can't produce semantic edits for the target, the tool throws — there is no text fallback.
- **`code_health` coverage/unused** — depends on `coverage/coverage-summary.json` and `knip.json` at the project root. Use `coveragePath` and `unusedPath` params for non-standard locations.
- **`code_impact`** — `change`-only requests (no target, no changeSetFiles) return insufficient-evidence instead of guessing.
- **`code_find` AST test mode** — `mode: "ast"` with `kind: "test"` matches outline entries with test-like names. Does not find test blocks within untest-like wrapper functions.

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
- `code_orientation` — **active** (orientation surface; replaces `code_brief` and old `code_context`)
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
4. `code_orientation(targetId)` → orient around definitions, docs, and local diagnostics
5. Edit files, then `code_health(scope="packages/...", refresh=true)` → verify diagnostics

### Context from a known source location (one call)

When you already know the file and identifier coordinate, skip the separate `code_resolve` turn and pass coordinates directly to `code_orientation`:

1. `code_orientation(focus="packages/.../execute-health.ts", line=42, character=17)` → resolves the target, renders the sections, and returns a reusable `targetId`
2. `code_graph(targetId, relations=["references"])` → follow up using the `targetId` from step 1

### Understand a package before editing

1. `code_orientation(focus="packages/supi-code-intelligence")` → package orientation
2. `code_orientation(focus="packages/supi-code-intelligence/src/tool")` → directory drill-down
3. `code_orientation(focus="packages/.../execute-graph.ts")` → file overview

### Safe refactoring

1. `code_resolve(query="oldFunctionName")` → capture `targetId`
2. `code_graph(targetId, relations=["references"])` → confirm scope
3. `code_refactor_plan(targetId, operation="rename_symbol", newName="newFunctionName")` → preview plan
4. `code_refactor_apply(planId)` → apply after reviewing the plan

## Tool overview

### `code_orientation`
Primary orientation surface for understanding where you are before choosing surgical tools.

- accepts `focus`, `targetId`, `line`, `character`, and `maxResults`
- omit `focus` for project orientation
- `focus` is path-first and language-agnostic; if no path exists, discovered module-name lookup is attempted
- `focus` + `line` + `character` resolves a real symbol target through the same provider-backed path as `code_resolve` and exposes a reusable `targetId`
- `targetId` takes precedence over `focus`/coordinates; stale target IDs error and do not fall back
- symbol orientation renders definitions, JSDoc/TSDoc docs, local diagnostics near the target, and Read Next guidance
- use `code_graph` for references/callees/imports/exports/tests, `code_impact` for blast radius, and `code_health` for full health/status
- `maxResults` defaults to 10 and caps each rendered list independently
- `code_orientation` replaces `code_brief` and the old `code_context` public surface; there is no compatibility alias

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
- `callees` reports **structural outgoing calls** from the enclosing executable scope at the target anchor. It matches call expressions by source shape, not symbol identity. By default (`calleeDepth: "direct"`), calls inside nested function/method/callback scopes are excluded. Pass `calleeDepth: "deep"` to include all callees within the enclosing scope, including those inside nested scopes.
- Test-producing surfaces also include a small structured tests metadata shape in tool details: discovery status/provenance plus per-file label status and extracted labels.
- Targeted graph results include a `Read Next` guidance section for the resolved target, enclosing scope, or top relation sites when those source ranges are known.
- `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion tests using semantic import/reference evidence plus deterministic package-layout conventions (`__tests__/unit/…`, `__tests__/integration/…`)
- Test-label extraction is tracked separately from discovery provenance. When a discovered test file has no recognized `describe` / `it` / `test` / `spec` blocks, user-facing output shows `_(no recognized test blocks)_` intentionally instead of helper or variable names.
- Bounded package/tool-aware candidates are generated for source files at `src/tool/execute-<name>.ts`. Exact candidates such as `code-<name>-tool.test.ts`, `<name>-tool.test.ts`, and `execute-<name>.test.ts` are checked in both `__tests__/unit/` and `__tests__/integration/`. No broad search, fuzzy matching, or AI guessing is performed.

### `code_impact`
Preferred workflow-oriented impact analysis.

- supports the existing target-based path (`targetId`, anchored coords, symbol)
- adds change-set entry points for `changeSetFiles` and explicit `includeTests`
- `includeTests` uses the same shared test discovery as `code_graph` (import/reference evidence plus package-layout conventions)
- **Target-based analysis** uses semantic references and fails explicitly when no LSP provider is available
- **changeSetFiles analysis** uses structural evidence by default and, when LSP/export data is available, merges semantic references for symbols defined in change-set files. `changeSetFiles` is user-supplied; it is not inferred from git and carries no line-level diff evidence. Evidence is annotated as either `**Evidence: structural**` or `**Evidence: semantic+structural**`.
- **test list annotations** — when likely tests are shown, impact headings annotate discovery provenance explicitly (`Likely Tests (semantic+conventions)` or `Likely Tests (conventions-only)`)
- **explicit empty-test note** — when `includeTests: true` is set and bounded companion/package discovery completes without finding any test files, an explicit `No likely tests found by bounded companion/package discovery.` note appears instead of silently omitting test information. This note is not shown when `includeTests` is omitted or unavailable.
- **target-based analysis seeds the target file itself** — zero-reference targets still report affected evidence and likely tests
- target and change-set impact results include a `Read Next` guidance section for source ranges worth inspecting before editing
- when the workspace clearly uses Vitest, likely test files also come with concrete `pnpm vitest run … --reporter=verbose` commands
- `change`-only requests stay honest and return an explicit insufficient-evidence result instead of heuristic guessing
- uses real workspace/provider evidence only; no heuristic grep fallback

### `code_find`
Unified ranked search tool with a strict evidence contract.

- omitted `mode` or `mode: "text"` → literal text search; `kind` is not accepted
- `mode: "regex"` → ripgrep regex search; `kind` is not accepted
- `mode: "semantic"` → LSP workspace symbol search; `kind` is not accepted and semantic mode does not fall back to text search
- `mode: "ast"` → tree-sitter structured search; requires explicit `kind`
- supported AST kinds: `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, `test`
- AST `call` mode matches call-site identifiers by name, not by symbol identity; use `code_graph` with `relations: ["references"]` on a resolved target for identity-aware callers
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

The `code_affected` tool has been fully removed. Use `code_impact` exclusively.

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
- `changeSetFiles`
- `includeTests`
- `maxResults`
- `contextLines`

Notes:
- line and character positions are **1-based**
- `line` and `character` require `file`, not `scope`
- `code_inspect` is the public point-inspection tool for `file` + `line` + `character`
- `targetId` (from `code_resolve`) can replace raw coordinates in `code_orientation`, `code_graph`, `code_impact`, and `code_refactor_plan`. In `code_orientation`, `targetId` takes precedence over `focus`/`line`/`character`; a stale/invalid `targetId` errors and does not fall back to coordinates.
- `code_orientation` accepts `focus` + `line` + `character` directly as a coordinate target mode: it resolves a real symbol target through the same provider-backed path as `code_resolve` and exposes a reusable `targetId`. Coordinate mode requires all three fields when any is present; `focus` must be a file path and partial coordinates are a validation error.
- `focus` is the selection input for `code_orientation`; other tools keep `scope` for narrowing/filtering.
- `focus`, `scope`, and `file` use pi-style paths where applicable: a leading `@` is stripped and relative paths resolve from the current cwd
- non-search tools do **not** silently fall back to heuristic grep behavior

### `code_resolve` anchored coordinate resolution

`code_resolve({ file, line, character })` resolves a **real symbol target** from provider-backed evidence, not an anonymous point target:

- an exact coordinate on a symbol identifier resolves to a named `name` anchor with a stable `targetId`.
- a coordinate on a declaration header/modifier (such as an `export` keyword) snaps to the symbol's name anchor **only when** provider-backed evidence identifies exactly one enclosing symbol. Snapped results carry a visible note and structured resolution metadata (requested vs. resolved coordinate and evidence source).
- ambiguous coordinates return ranked candidates with `targetId`s and do not pick one silently.
- whitespace, comment, or other non-symbol coordinates return an explicit error and recommend `code_inspect` for point-level facts — `code_resolve` does not register anonymous point targets.

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
