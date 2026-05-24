# @mrclrchtr/supi-code-intelligence

Architecture briefs, factual code maps, relationship tracing, impact assessment, and explicit search for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused tool surface (`code_brief`, `code_map`, `code_relations`, `code_affected`, `code_pattern`)
- May include cross-family orchestration guidance that steers the model between `code_*`, `lsp_*`, and `tree_sitter_*` tools
- Installing this package activates all three tool families (`code_*`, `lsp_*`, `tree_sitter_*`)
- Does **not** own a session-scoped cache or runtime service — stays stateless at the orchestration level
- `@mrclrchtr/supi-code-intelligence/api` → `src/api.ts` / `src/index.ts` exposes reusable architecture helpers

## Architecture

```text
src/
├── code-intelligence.ts    # Extension factory — overview injection + focused tool registration
├── index.ts                # Public API exports for programmatic consumers
├── types.ts                # Result metadata types (BriefDetails, MapDetails, SearchDetails, etc.)
├── architecture.ts         # Project model builder (workspace scan, module detection)
├── brief.ts                # Public facade for brief/overview helpers (delegates to use-case + presentation)
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── resolve-target.ts       # Action-facing target resolution — routes normalized queries, maps typed outcomes
├── target-resolution.ts    # Facade over the targeting pipeline (backward-compat exports)
├── targeting/
│   ├── types.ts               # Normalized query, resolver deps, typed outcomes
│   ├── query.ts                # Params → NormalizedQuery normalization
│   ├── resolve-anchored.ts     # File + position resolution (no LSP needed)
│   ├── resolve-symbol.ts       # Semantic symbol discovery (LSP-only, no text fallback)
│   └── resolve-file.ts         # File-level target group discovery (LSP+Tree-sitter with fallback)
├── use-case/
│   ├── types.ts                # Shared typed data interfaces (OverviewData, BriefInput, etc.)
│   ├── build-overview.ts       # Hidden overview data builder from ArchitectureModel
│   ├── generate-brief.ts       # Brief orchestration — project/path/file/anchored/symbol
│   ├── generate-map.ts         # Map orchestration — factual filesystem inventory
│   ├── generate-relations.ts   # Relations orchestration — callers, callees, implementations
│   ├── generate-affected.ts    # Affected orchestration — impact analysis
│   ├── generate-pattern.ts     # Pattern orchestration — literal/regex/structured search
│   └── support/
│       └── semantic-references.ts  # Shared reference collection/aggregation helpers
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── brief.ts                # Brief markdown renderer (anchored + symbol)
│   ├── map.ts                  # Factual map markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── affected.ts             # Affected markdown renderer
│   └── pattern.ts              # Pattern search markdown renderer
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── tool/
│   ├── tool-specs.ts          # Single source of truth for the public focused-tool metadata
│   ├── guidance.ts            # prompt surfaces derived from tool specs
│   ├── register-tools.ts      # focused Pi tool registration
│   ├── execute-brief.ts       # Thin code_brief adapter → use-case/presentation
│   ├── execute-map.ts         # Thin code_map adapter → use-case/presentation
│   ├── execute-relations.ts   # Thin code_relations adapter → use-case/presentation
│   ├── execute-affected.ts    # Thin code_affected adapter → use-case/presentation
│   └── execute-pattern.ts     # Thin code_pattern adapter → use-case/presentation
├── substrates/
│   ├── lsp-adapter.ts         # Session-scoped LSP access via SemanticSubstrate
│   └── tree-sitter-adapter.ts # Shared Tree-sitter service access via StructuralSubstrate
```

## Public tool contracts

### `code_brief`
Interpretive orientation tool. Use for prioritized project/package/directory/file/symbol context.

### `code_map`
Strictly factual inventory tool. Accepts the repo root, a package root, or **any directory path**. Rejects file paths.

### `code_relations`
Relationship tracing tool with `kind: "callers" | "callees" | "implementations"`.
- `callers` — semantic-only
- `callees` — structural-only
- `implementations` — semantic-only

### `code_affected`
Semantic blast-radius tool. Uses semantic references plus the architecture model. No implicit grep fallback.

### `code_pattern`
Explicit search tool. This is the only tool in the family that intentionally exposes heuristic/text-search behavior.

## Key gotchas

### Public-surface split
- `code_map` must stay factual. Do not add prioritized “start here” guidance there.
- `code_pattern` is the sole heuristic/search-oriented tool.
- `code_relations` and `code_affected` should prefer explicit unavailable states over text-search guesses.

### Param validation
- `line`/`character` require `file`, **not** `path`.
- `code_map` should reject file paths.
- `pattern` structured `kind` must be `definition`, `export`, or `import`.

### Target resolution
- Symbol discovery is semantic-only for non-search tools.
- File-level target expansion is allowed only when the required substrate can support it.
- Multiple semantic symbol matches should return disambiguation, not heuristic guesses.

### First-turn overview
- Injected via `before_agent_start` on the first turn; deduplicated via `hasInjectedOverview`.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- On reload/resume, scans the branch for an existing `code-intelligence-overview` custom message.

### Confidence & metadata
- `details` should stay tool-specific and explicit.
- `heuristic` confidence should primarily appear in `code_pattern` results.
- Relationship and impact tools should usually resolve to `semantic`, `structural`, or `unavailable`.

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
