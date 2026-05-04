# @mrclrchtr/supi-code-intelligence

Architecture briefs, caller/callee analysis, impact assessment, and pattern search for pi. Registers the `code_intel` tool.

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
├── guidance.ts             # promptGuidelines + promptSnippet + toolDescription
├── types.ts                # Result metadata types (BriefDetails, SearchDetails, etc.)
├── tool-actions.ts         # Action dispatcher + param validation
├── architecture.ts         # Project model builder (workspace scan, module detection)
├── brief.ts                # Overview + project brief generation
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── target-resolution.ts    # Symbol → file:position resolution (LSP / ripgrep)
├── resolve-target.ts       # Action params → resolved target or disambiguation
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
└── actions/
    ├── brief-action.ts         # Architecture overviews + anchored briefs
    ├── callers-action.ts       # Find call sites (LSP → ripgrep)
    ├── callees-action.ts       # Outgoing call map (tree-sitter)
    ├── implementations-action.ts # Find implementations (LSP → ripgrep)
    ├── affected-action.ts      # Blast-radius + risk assessment
    └── pattern-action.ts       # Bounded text search (literal or regex)
```

### Injection Points (6 hooks into pi)

| # | Hook | What It Does |
|---|---|---|
| 1 | `package.json` → `pi.extensions` | Manifest entry — pi loads the extension at startup |
| 2 | `pi.registerTool({ name: "code_intel" })` | Registers 6 actions as agent-callable tool |
| 3 | `promptGuidelines` (6 bullets) | Flattened into system prompt `Guidelines:` section |
| 4 | `promptSnippet` (1 line) | Tool-context reminder to favor `code_intel` over raw reads |
| 5 | `pi.on("session_start", ...)` | Resets dedup state, scans branch for existing overview |
| 6 | `pi.on("before_agent_start", ...)` | Injects compact architecture overview on first agent turn |

### Action Dispatching

`tool-actions.ts` validates params, then routes to one of six action handlers in `src/actions/`. Validation errors are returned as explicit Markdown strings, not thrown.

```ts
switch (params.action) {
  case "brief":       → executeBriefAction(params, cwd)
  case "callers":     → executeCallersAction(params, cwd)
  case "callees":     → executeCalleesAction(params, cwd)
  case "implementations": → executeImplementationsAction(params, cwd)
  case "affected":    → executeAffectedAction(params, cwd)
  case "pattern":     → executePatternAction(params, cwd)
}
```

### Fallback Chain

LSP → Tree-sitter → ripgrep text search, with explicit confidence labeling on every result:

| Label | Source |
|---|---|
| `semantic` | LSP (definitions, references, diagnostics) |
| `structural` | Tree-sitter AST (outlines, imports/exports) |
| `heuristic` | `rg` text search |
| `unavailable` | No data produced |

## Key Gotchas

### Param Validation (tool-actions.ts:validateParams)
- `line`/`character` require `file`, **not** `path`. `path` is for scope/focus; `file` anchors a position.
- `file` pointing to a directory is rejected — use `path` for directory scoping.
- `line`/`character` without `file` is rejected.
- Unknown action is rejected with a list of supported actions.

### Pattern Search (pattern-action.ts)
- `pattern` is treated as a **literal string by default** — the action calls `escapeRegex()` on the input before passing to ripgrep.
- Set `regex: true` to opt into raw ripgrep regex semantics.
- Malformed regex input returns an explicit error message via `formatRegexError()` — never a misleading "No matches found."
- Internally searches with `maxMatches: maxResults * 3` for dedup filtering.

### Target Resolution (resolve-target.ts, target-resolution.ts)
- Symbol resolution goes through LSP `workspaceSymbol` first, then ripgrep fallback.
- **Multiple candidates** return a disambiguation message with numbered options instead of picking automatically.
- LSP candidates are filtered by `isWithinOrEqual` path scope, SymbolKind, and exported-only heuristic.
- Binary files (`.png`, `.jpg`, `.wasm`, etc.) are explicitly rejected during anchored target resolution.
- `filterOutDeclaration()` strips the source declaration from LSP reference results — the declaration is the symbol being changed, not a call site.

### First-Turn Overview
- Deduplicated via `hasInjectedOverview` flag reset in `session_start`.
- On reload/resume, `session_start` scans the branch for an existing `code-intelligence-overview` custom message.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- `buildArchitectureModel` supports: pnpm-workspace.yaml, package.json workspaces, single-package, and minimal (no manifest but source files exist).

### Architecture Model (architecture.ts)
- Project markers searched: `package.json`, `pnpm-workspace.yaml`, `deno.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`.
- Workspace packages detected via pnpm-workspace.yaml `packages:` array or `package.json` `workspaces` field.
- Internal vs external dep separation uses `workspace:*` version prefix heuristic.
- Glob expansion supports `packages/*` (single level) and `packages/**` (up to depth 5).
- `findModuleForPath()` returns the deepest matching module for nested monorepo layouts.

### Confidence & Metadata
- Every action handler returns formatted Markdown for the agent to read **plus** structured `details` metadata (`BriefDetails`, `SearchDetails`, `AffectedDetails`, or `DisambiguationCandidate[]`).
- The metadata includes `nextQueries` — suggested follow-up `code_intel` calls for the agent.
- Risk assessment in `affected-action.ts`:
  - `high`: >10 refs || >3 modules || >1 downstream
  - `medium`: >3 refs || >1 module || ≥1 downstream
  - `low`: otherwise

### rippgrep Wrapper (search-helpers.ts)
- `runRipgrep()` — legacy behavior: any execution failure returns empty matches (error swallowed).
- `runRipgrepDetailed()` — preserves non-no-match errors (used by pattern-action for regex validation).
- Low-signal paths (`node_modules`, `.pnpm`, `dist`, `.next`, `__pycache__`, etc.) are filtered out unless `filterLowSignal: false`.
- Context lines: trailing context from one match that overlaps with the next match's leading context is deduplicated.

### Programmatic API (index.ts)
- `buildArchitectureModel`, `generateOverview`, `generateProjectBrief`, `generateFocusedBrief` are exported for peer extensions.
- Target resolution helpers (`normalizePath`, `resolveAnchoredTarget`, `resolveSymbolTarget`, `toZeroBased`) are exported.
- All result types (`ArchitectureModel`, `BriefDetails`, `SearchDetails`, `AffectedDetails`, `CodeIntelResult`, `ConfidenceMode`, `DisambiguationCandidate`) are exported.

## Testing Patterns

- Tests use `mkdtempSync` + `writeJson` helpers to build temporary project structures.
- `graphql-test-v2`-style: create minimal `package.json`, `pnpm-workspace.yaml`, and source files in a temp dir, then call functions directly.
- Architecture tests verify model shape (name, modules, edges, leaf marking).
- Action tests verify validation, error messages, and output formatting.
- No `vi.mock` needed — tests operate on real filesystem in temp dirs.
- Package test tsconfig extends root `tsconfig.json` with `include: ["*.ts"]`.

```ts
// Standard pattern
let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(path.join(os.tmpdir(), "prefix-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });
function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}
```

## Dependencies

- **`@mrclrchtr/supi-core`** — `findProjectRoot`, `walkProject`, `isWithinOrEqual`
- **`@mrclrchtr/supi-lsp`** — `getSessionLspService`, `SessionLspService`, `Position`
- **`@mrclrchtr/supi-tree-sitter`** — `createTreeSitterSession` (for `callees` and anchored brief outline)
- **`@mariozechner/pi-ai`** — `StringEnum` for TypeScript enum type generation
- **`@mariozechner/pi-coding-agent`** — `ExtensionAPI`, `BeforeAgentStartEventResult`
- **`typebox`** — `Type.Object(...)` for tool parameter schema
- **External runtime**: `rg` (ripgrep) via `child_process.execFileSync`

## License

MIT
