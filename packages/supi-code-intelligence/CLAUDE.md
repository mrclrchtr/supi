# @mrclrchtr/supi-code-intelligence

Architecture briefs, factual code maps, relationship tracing, impact assessment, and explicit search for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused tool surface (`code_brief`, `code_map`, `code_relations`, `code_affected`, `code_pattern`)
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

```text
src/
├── code-intelligence.ts    # Extension factory — overview injection + focused tool registration
├── index.ts                # Public API exports for programmatic consumers
├── types.ts                # Result metadata types (BriefDetails, MapDetails, SearchDetails, etc.)
├── architecture.ts         # Project model builder (workspace scan, module detection)
├── brief.ts                # Overview + project brief generation
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── target-resolution.ts    # Symbol → file:position resolution (semantic-first, no heuristic fallback)
├── resolve-target.ts       # Shared target resolution helpers for semantic/structural actions
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── tool/
│   ├── tool-specs.ts          # Single source of truth for the public focused-tool metadata
│   ├── guidance.ts            # prompt surfaces derived from tool specs
│   ├── register-tools.ts      # focused Pi tool registration
│   ├── execute-brief.ts       # public code_brief adapter
│   ├── execute-map.ts         # public code_map adapter
│   ├── execute-relations.ts   # public code_relations adapter
│   ├── execute-affected.ts    # public code_affected adapter
│   └── execute-pattern.ts     # public code_pattern adapter
├── providers/
│   ├── semantic-provider.ts   # Session-scoped LSP access + short readiness waits
│   └── structural-provider.ts # Shared Tree-sitter service access with short-lived fallback
└── actions/
    ├── brief-action.ts         # Architecture overviews + anchored briefs
    ├── map-action.ts           # Factual project/package/directory maps
    ├── callers-action.ts       # Semantic callers only
    ├── callees-action.ts       # Structural callees only
    ├── implementations-action.ts # Semantic implementations only
    ├── affected-action.ts      # Semantic + architecture-only impact behavior
    └── pattern-action.ts       # Explicit literal/regex/structured search
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
