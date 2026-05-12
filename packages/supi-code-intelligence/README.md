# @mrclrchtr/supi-code-intelligence

SuPi Code Intelligence extension — the main agent-facing code understanding tool for [pi](https://github.com/earendil-works/pi).

Registers the `code_intel` tool with seven high-level actions and injects structural project context into the agent's first turn.

## Injection Points

The extension hooks into pi's lifecycle at six points:

| # | Injection Point | What It Does |
|---|---|---|
| 1 | `package.json` → `pi.extensions` | Manifest entry that tells pi to load the extension at startup |
| 2 | `pi.registerTool({ name: "code_intel", ... })` | Makes the `code_intel` tool callable from agent turns |
| 3 | `promptGuidelines` (7 guidelines) | Flattened into the system prompt's `Guidelines:` section — teaches the agent *when* to use each action |
| 4 | `promptSnippet` (1 line) | Injected near the tool definition in context — short reminder to use `code_intel` over broad file reads |
| 5 | `pi.on("session_start", ...)` | Resets injection dedup state and scans the active branch to avoid re-injecting on reload/resume |
| 6 | `pi.on("before_agent_start", ...)` | On the first agent turn, builds an architecture model and injects a compact Markdown overview as a custom message (`customType: "code-intelligence-overview"`, `display: false`) — the agent sees it in conversation context without UI clutter |

### First-Turn Overview Flow

1. `session_start` fires → resets `hasInjectedOverview`, scans branch for existing `code-intelligence-overview` custom message
2. First `before_agent_start` fires → calls `buildArchitectureModel(ctx.cwd)` to parse the project
3. If modules are found, `generateOverview(model)` produces a dense Markdown summary (~500 tokens, max 8 modules) with git context when available
4. Returns a `BeforeAgentStartEventResult` with a `customMessage`; pi places it in the agent's context
5. Subsequent turns skip injection entirely

## Tool Actions

### `brief` — Architecture overviews and focused briefs

Scopes: project (no params), package/directory (`path`), file (`file`), or anchored symbol (`file`, `line`, and `character`).

- Project-level brief: module listing, dependency graph, "start here" recommendations, suggested next queries
- Focused brief (`path` or anchored symbol): stripped-down version with a single module or symbol focus
- Now includes git context (branch, dirty files, last commit) when inside a git repository
- Metadata returned: `BriefDetails` with confidence, focus target, public surfaces, dependency summary

### `callers` — Find call sites for a symbol

- LSP-first (references query), falls back to heuristic text search (word-boundary ripgrep)
- Results grouped by file with ranked, contextual call sites
- Confidence labeling: `semantic` (LSP), `heuristic` (text search)

### `callees` — Structural outgoing call map

- Structural tree-sitter analysis for all grammars configured in `supi-tree-sitter`
- Finds outgoing function/method calls from an anchored position
- Supports JavaScript/TypeScript, Python, Rust, Go, C/C++, Java, Kotlin, Ruby, Bash, and R

### `implementations` — Find concrete implementations

- Resolves interface/abstract method implementations via LSP
- Falls back to heuristic text search for `implements`/`extends` patterns

### `affected` — Blast-radius analysis

Before changing exported APIs, shared helpers, config surfaces, or cross-package contracts:
- Direct references (callers/importers)
- Downstream dependents (transitive)
- Risk level: `low` | `medium` | `high`
- Likely test files
- Returns `AffectedDetails` metadata

### `index` — Factual project map

A non-interpretive project overview for quick orientation:

- File counts by language/extension
- Top-level directory tree with file counts
- Landmark config files detected (package.json, tsconfig.json, Makefile, etc.)
- Skips low-signal directories (`node_modules`, `dist`, `build`, `.git`)

Use when you need to understand "what's here?" before diving into specific files.

```json
{ "action": "index" }
```

### `pattern` — Bounded, scope-aware text search

Optimized for common agent lookups:

- `pattern` is treated as a **literal string by default**
- Set `regex: true` to opt into raw ripgrep regex semantics
- Malformed regex input returns an explicit error instead of a misleading "No matches found"
- Nearby matches in the same file deduplicate overlapping context lines to reduce token waste
- Results grouped with file and context lines
- `summary: true` returns aggregate counts by directory instead of line-level matches (useful for "how common is this pattern?")

Examples:

```json
{ "action": "pattern", "pattern": "sendMessage({", "path": "packages/" }
{ "action": "pattern", "pattern": "register(Settings|Config)", "path": "packages/", "regex": true }
{ "action": "pattern", "pattern": "createServerFn", "summary": true }
```

## Language & File Type Support

| Feature / Language | JS/TS | Python | Rust | Go | Java/Kotlin | Ruby | PHP | Swift | C/C++ | Other text |
|---|---|---|---|---|---|---|---|---|---|---|
| **`index`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`brief` (project)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅¹ |
| **`brief` (directory/file)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`callers`** | ✅ | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ⚠️³ |
| **`callees`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **`implementations`** | ✅ | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ⚠️³ |
| **`affected`** | ✅ | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ✅² | ⚠️³ |
| **`pattern`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅⁴ |

**Legend:**
- **✅** Fully supported for that action.
- **⚠️** Partial or best-effort support (see footnotes).
- **❌** Not supported for that action.
- **¹** Project-level brief works for any project with a recognized manifest (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.).
- **²** Requires an active LSP server for semantic resolution; falls back to heuristic text search otherwise.
- **³** Heuristic text-search fallback only; no semantic or structural resolution.
- **⁴** `pattern` works on any text file. Binary files (`.png`, `.jpg`, `.zip`, `.pdf`, etc.) are explicitly rejected.

## Confidence Labeling

Every result carries a `confidence` label from the result metadata:

| Label | Meaning |
|---|---|
| `semantic` | Truth from LSP (definitions, references, diagnostics) |
| `structural` | From tree-sitter AST (outlines, imports/exports, syntax) |
| `heuristic` | Text search / best-effort inference |
| `unavailable` | No data could be produced |

## Result Metadata

**Contract:** `details` is returned for every action handler execution. It is
`undefined` *only* when the request is rejected before any handler runs
(parameter validation errors, unknown action, missing required `pattern`).

For no-result and error states, `details` carries `confidence: "unavailable"` or
`confidence: "heuristic"` with appropriately zeroed counts, so consumers always
get structured metadata back.

- **`brief`** → `BriefDetails` (confidence, focus target, start-here suggestions, public surfaces, dependency summary, omitted count, next queries)
- **`search`** → `SearchDetails` (callers/callees/implementations/pattern: confidence, scope, candidate count, omitted count)
- **`affected`** → `AffectedDetails` (direct count, downstream count, risk level, likely tests, check-next list)

## Parameter Validation

The tool enforces these rules and returns explicit error messages:

- `line`/`character` require `file`, not `path` — `path` is for scope/focus, `file` anchors a position
- `file` that points to a directory is rejected — use `path` for directory scoping
- Unknown actions are rejected with a list of supported actions

## Architecture

Each action employs an appropriate fallback chain from the available services:

- **`@mrclrchtr/supi-lsp`** — Semantic truth via LSP (references, symbols, implementations, diagnostics)
- **`@mrclrchtr/supi-tree-sitter`** — Structural extraction (outlines, imports/exports, callees, syntax context)
- **`@mrclrchtr/supi-core`** — Project/root utilities (root walking, known-root mapping, path containment)

**Per-action fallback chains:** `callers`, `implementations`, and `affected` use LSP → ripgrep text search; `callees` uses tree-sitter AST analysis; `brief` uses the architecture model (plus tree-sitter outline for anchored briefs); `pattern` and `index` use filesystem and text-search primitives.

### Programmatic API

The package exports its internal APIs for use by peer extensions:

```ts
// Architecture model
export type { ArchitectureModel, DependencyEdge, ModuleInfo } from "./architecture.ts";
export { buildArchitectureModel, findModuleForPath, getDependencies, getDependents } from "./architecture.ts";

// Brief generation
export { generateFocusedBrief, generateOverview, generateProjectBrief } from "./brief.ts";

// Target resolution
export type { ResolvedTarget, TargetResolutionResult } from "./target-resolution.ts";
export { normalizePath, resolveAnchoredTarget, resolveSymbolTarget, toZeroBased } from "./target-resolution.ts";

// Result types
export type { AffectedDetails, BriefDetails, CodeIntelResult, ConfidenceMode, DisambiguationCandidate, SearchDetails } from "./types.ts";
```

## Session Integration

- The overview custom message type (`code-intelligence-overview`) uses `display: false` so it appears in the LLM context but not in the TUI message log
- On `session_start`, the extension scans the session branch for an existing overview to avoid re-injecting on `/reload` or session resume
- The `hasInjectedOverview` flag is per-session, reset each `session_start`

## Prompt Guidelines (full text)

These seven guidelines are injected into the system prompt:

> - Use `code_intel brief` before editing an unfamiliar package, directory, or file to get architecture context and reduce blind reads.
> - Use `code_intel affected` before changing exported APIs, shared helpers, config surfaces, or cross-package contracts to check blast radius and risk.
> - Use `code_intel callers` before modifying a function to verify all call sites; use `callees` and `implementations` for dependency and interface analysis.
> - Use `code_intel pattern` for bounded, scope-aware text search when the question is textual rather than semantic; it treats patterns as literal strings by default and supports `regex: true` when needed.
> - Use `code_intel index` for a factual project map (file counts, directory structure, landmark files) when you need to orient yourself in a new codebase.
> - After `code_intel` narrows the target, use raw `lsp` and `tree_sitter` tools for precise drill-down on exact symbols, types, or AST nodes.
> - Do not prefer `code_intel` over direct file reads or lower-level tools for trivial, already-localized edits or exact symbol/AST drill-down tasks.

## Install

Included in the `@mrclrchtr/supi` meta-package, or install standalone:

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

## License

MIT
