# @mrclrchtr/supi-code-intelligence

Architecture briefs, caller/callee analysis, impact assessment, and pattern search for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the `code_intel` tool
- `@mrclrchtr/supi-code-intelligence/api` → `src/api.ts` / `src/index.ts` exposes reusable architecture helpers

## Commands

```bash
# Test (package-scoped)
pnpm vitest run packages/supi-code-intelligence/

# Typecheck (source + tests)
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json

# Biome (package-scoped)
pnpm exec biome check packages/supi-code-intelligence/
```

## Architecture

```
src/
├── code-intelligence.ts    # Extension factory — registers tool + event hooks
├── index.ts                # Public API exports for programmatic consumers
├── types.ts                # Result metadata types (BriefDetails, SearchDetails, etc.)
├── tool-actions.ts         # Action dispatcher + param validation
├── architecture.ts         # Project model builder (workspace scan, module detection)
├── brief.ts                # Overview + project brief generation
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── target-resolution.ts    # Symbol → file:position resolution (LSP / ripgrep)
├── resolve-target.ts       # Action params → resolved target or disambiguation
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── tool/
│   ├── action-specs.ts        # Single source of truth for public action metadata
│   └── guidance.ts            # promptGuidelines + promptSnippet + toolDescription
├── providers/
│   ├── semantic-provider.ts   # Session-scoped LSP access + short readiness waits
│   └── structural-provider.ts # Shared Tree-sitter service access with short-lived fallback
└── actions/
    ├── brief-action.ts         # Architecture overviews + anchored briefs
    ├── callers-action.ts       # Find call sites (LSP → ripgrep)
    ├── callees-action.ts       # Outgoing call map (tree-sitter)
    ├── implementations-action.ts # Find implementations (LSP → ripgrep)
    ├── affected-action.ts      # Blast-radius + risk assessment
    ├── pattern-action.ts       # Bounded text search (literal or regex)
    └── index-action.ts         # Factual project map (file counts, directories, landmarks)

__tests__/
├── helpers/
│   └── test-utils.ts          # createTempDir() — shared temp-dir/cleanup/writeJson utility
├── fixtures/                  # Sample data and test projects (available for future use)
├── unit/                      # Focused, fast tests (16 files testing individual modules)
├── integration/               # End-to-end and cross-module tests (3 files)
└── tsconfig.json
```

### Injection Points (6 hooks into pi)

| # | Hook | What It Does |
|---|---|---|
| 1 | `package.json` → `pi.extensions` | Manifest entry — pi loads the extension at startup |
| 2 | `pi.registerTool({ name: "code_intel" })` | Registers 7 actions as agent-callable tool |
| 3 | `promptGuidelines` (routing bullets) | Flattened into system prompt `Guidelines:` section |
| 4 | `promptSnippet` (1 line) | Tool-context reminder to favor `code_intel` over raw reads |
| 5 | `pi.on("session_start", ...)` | Resets dedup state, scans branch for existing overview |
| 6 | `pi.on("before_agent_start", ...)` | Injects compact architecture overview on first agent turn |

### Action Dispatching

`tool-actions.ts` validates params, then routes to one of seven action handlers in `src/actions/`. Validation errors are returned as explicit Markdown strings, not thrown.

```ts
switch (params.action) {
  case "brief":       → executeBriefAction(params, cwd)
  case "callers":     → executeCallersAction(params, cwd)
  case "callees":     → executeCalleesAction(params, cwd)
  case "implementations": → executeImplementationsAction(params, cwd)
  case "affected":    → executeAffectedAction(params, cwd)
  case "pattern":     → executePatternAction(params, cwd)
  case "index":       → executeIndexAction(cwd)
}
```

### Fallback Chain

Semantic provider (LSP) → structural provider (Tree-sitter where applicable) → ripgrep text search, with explicit confidence labeling on every result:

| Label | Source |
|---|---|
| `semantic` | LSP (definitions, references, diagnostics, implementations) |
| `structural` | Tree-sitter AST (outlines, imports/exports, callees) |
| `heuristic` | `rg` text search |
| `unavailable` | No data produced |

## Key Gotchas

### Param Validation
- `line`/`character` require `file`, **not** `path`. `path` is for scope/focus; `file` anchors a position.
- `file` pointing to a directory is rejected — use `path` for directory scoping.
- `line`/`character` without `file` is rejected.

### Pattern Search
- `pattern` is treated as a **literal string by default** — set `regex: true` to opt into raw ripgrep regex.
- Malformed regex returns an explicit error message, never a misleading "No matches found."
- `summary: true` returns aggregate counts by directory instead of line-level matches.

### Target Resolution
- Symbol resolution: semantic provider (`workspaceSymbol` with a short readiness wait) → ripgrep fallback. Multiple candidates return a disambiguation message.
- `filterOutDeclaration()` strips the source declaration from LSP reference results.
- Binary files (`.png`, `.jpg`, `.wasm`, etc.) are explicitly rejected.

### First-Turn Overview
- Injected via `before_agent_start` on the first turn; deduplicated via `hasInjectedOverview` flag.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- On reload/resume, scans the branch for an existing `code-intelligence-overview` custom message.
- `buildArchitectureModel` supports: pnpm-workspace.yaml, package.json workspaces, single-package, and minimal.

### Architecture Model
- Internal vs external dep separation uses `workspace:*` version prefix heuristic.
- `findModuleForPath()` returns the deepest matching module for nested monorepo layouts.

### Confidence & Metadata
- `details` is always returned for action handler executions. It is `undefined` only when the request is rejected before any handler runs (parameter validation, unknown action, missing required `pattern`).
- No-result and error states carry `confidence: "unavailable"` or `confidence: "heuristic"` with appropriately zeroed counts.
- Every action handler returns structured `details` alongside formatted Markdown:
  - `brief` → `{ type: "brief", data: BriefDetails }` (confidence, focus target, start-here, public surfaces, dependency summary, next queries)
  - `search` (callers, callees, implementations, pattern, index) → `{ type: "search", data: SearchDetails }` (confidence, scope, candidate count, omitted count)
  - `affected` → `{ type: "affected", data: AffectedDetails }` (confidence, direct count, downstream count, risk level, check-next, likely tests)
- Risk thresholds: `high` (>10 refs / >3 modules / >1 downstream), `medium` (>3 refs / >1 module / ≥1 downstream), `low` (otherwise).

## Testing Patterns

### Test layout

- **Unit tests** live in `__tests__/unit/` — focused, fast tests that test individual modules with temporary filesystem fixtures.
- **Integration tests** live in `__tests__/integration/` — end-to-end and cross-module tests that exercise the full action pipeline or require real system tools (git, ripgrep).
- **Shared helpers** in `__tests__/helpers/test-utils.ts` provide `createTempDir()` for consistent temp-directory setup/teardown.
- **Fixtures** in `__tests__/fixtures/` are available for sample data (currently empty).
- Package test tsconfig (`__tests__/tsconfig.json`) extends root with `include: ["**/*.ts", "../src/**/*.ts"].`

### Patterns

- Many tests use `mkdtempSync` + `writeJson` helpers to build temporary project structures.
- `graphql-test-v2`-style: create minimal `package.json`, `pnpm-workspace.yaml`, and source files in a temp dir, then call functions directly.
- Architecture tests verify model shape (name, modules, edges, leaf marking).
- Action tests verify validation, error messages, and output formatting.
- No `vi.mock` needed for most tests — they operate on the real filesystem in temp dirs.
- Fallback-chain and prioritization-signals tests use `vi.mock` to control LSP state.
- Tests that operate on real git repos (e.g., `integration/git-context.test.ts`) must disable GPG signing and pre-commit hooks:

  ```ts
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  execFileSync("git", ["config", "core.hooksPath", "/dev/null"], { cwd: dir });
  execFileSync("git", ["branch", "-m", "main"], { cwd: dir });
  ```

  **Why**: `commit.gpgsign` fails with `fatal: either user.signingkey or gpg.ssh.defaultKeyCommand needs to be configured` when a global signingkey is set. `core.hooksPath` skips pre-commit hooks (e.g., pre-commit) that may error on missing config. `git init` default branch varies by git version; rename forces a known name for assertions.

### Helper

```ts
import { createTempDir } from "../helpers/test-utils.ts";

const t = createTempDir("prefix-");
afterEach(() => t.cleanup());
t.writeJson("package.json", { name: "test" });
t.writeFile("index.ts", "export const x = 1;\n");
```

## Dependencies

- **`@mrclrchtr/supi-core/api`** — `findProjectRoot`, `walkProject`, `isWithinOrEqual`
- **`@mrclrchtr/supi-lsp/api`** — `getSessionLspService`, `SessionLspService`, `Position`
- **`@mrclrchtr/supi-tree-sitter/api`** — `getSessionTreeSitterService`, `createTreeSitterSession`, `TreeSitterService`
- **`@earendil-works/pi-ai`** — `StringEnum` for TypeScript enum type generation
- **`@earendil-works/pi-coding-agent`** — `ExtensionAPI`, `BeforeAgentStartEventResult`
- **`typebox`** — `Type.Object(...)` for tool parameter schema
- **External runtime**: `rg` (ripgrep) via `child_process.execFileSync`

## License

MIT
