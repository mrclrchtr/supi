# @mrclrchtr/supi-code-intelligence

Architecture briefs, factual inspection, reference tracing, call analysis, impact assessment, search, and semantic refactoring for pi. Registers all `code_*` tools.

Surfaces: `./extension` (tool registration), `./api` (reusable type contracts). Reads capability state from `@mrclrchtr/supi-code-runtime` — does not own a session-scoped cache.

## Source layering

Use `code_orientation` for detailed file layout. Key domains:

| Layer | Directory | Role |
|-------|-----------|------|
| Entry | `src/extension.ts`, `src/app/` | Pi event wiring, composition, session lifecycle |
| Public surface | `src/tool/<tool>/` | Each `code_*` tool with colocated TUI renderers |
| Analysis | `src/analysis/` | Pi-free logic — targets, briefs, references, search, tests, coverage, refactor safety |
| Substrates | `src/substrate/lsp/`, `src/substrate/tree-sitter/` | Adapter lifecycle only — no analysis logic |
| Session | `src/session/` | In-memory target/span handles and refactor plans |
| Shared UI | `src/ui/` | TUI helpers, markdown, status overlay, footer |

## Tool gotchas (non-obvious per tool)

- **`code_orientation`**: `focus` + `line` + `character` resolves real symbol targets (same path as `code_resolve`); `targetId` takes precedence. Directory focus surfaces `CLAUDE.md`/`AGENTS.md`.
- **`code_graph`**: `callees` matches call-site identifiers by source shape, not symbol identity. File-level expansion not supported — requires precise target. `code_graph` and `code_impact` share `src/analysis/tests/test-discovery.ts`; any divergence is a bug.
- **`code_impact`**: `changeSetFiles` is not inferred from git. `change`-only requests return insufficient-evidence. `includeTests` emits `likelyTestCommands` only when Vitest is detected.
- **`code_find`**: AST `call` mode matches by name, not symbol identity — use `code_graph` references for identity-aware callers. Unsupported mode/kind combos fail explicitly.
- **`code_resolve`**: Anchored resolution requires a real symbol target (exact identifier hit or unambiguous declaration header). Whitespace/comment coords error and recommend `code_inspect`. Target IDs are content-hash based (position excluded) — stable across reloads.
- **`code_refactor_plan`**: Throws for `unavailable` (provider can't produce precise edits). Returns `ambiguous` result for multi-target matches. Uses LSP code actions; no heuristic text fallback.
- **`code_refactor_apply`**: Revalidates SHA-256 fingerprints before apply. Acquires `withFileMutationQueue` per ADR 0006. Text-edit-only — no file/resource operations.

## Always-on LSP policy

- `lsp.enabled` / `lsp.active` are deprecated and ignored. LSP always attempts to start detected servers.
- Per-language disable: `lsp.servers.<language>.enabled: false` only.
- Deprecated keys surface via `supi-ci-status` overlay, `code_health`, and a one-time chat message (5s grace).

## TUI rendering

- Per-tool `renderCall`/`renderResult` colocated under `src/tool/<tool>/tui.ts`. Dual-surface: TUI body from `details`, markdown `content` as collapsible detail.
- **`renderShell: "self"` strips pi's Box entirely.** Avoid unless the tool needs full-screen control.

## Key gotchas

### Planner routing & error policy
- Central router in `planner.ts` returns `PlannerRoute` per intent. `unavailable` → **throw** from `execute()` (pi marks `isError: true`). Invalid usage (bad scope, stale targetId, malformed range) → return error text so model can retry. Partial unavailability → best-effort notes, no throw.
- `code_refactor_plan` checks `refactorAvailable`; warmup timeouts are transient readiness, not capability-unavailable.

### Tool adapter contract
- `tool/register.ts` head-truncates content at pi defaults (2000 lines / 50 KB); `details` never truncated. `spillToTempFile: true` writes full content on truncation.
- `signal` (AbortSignal) and `onUpdate` forwarded to every executor. Long-running executors forward to sub-processes.

### Param validation
- `code_inspect`, `code_graph`, `code_refactor_plan`: `line`/`character` require `file`, not `scope`.
- `code_orientation`: `line`/`character` require `focus`. `targetId` takes precedence; stale/invalid `targetId` errors without fallback.
- `code_graph` requires `targetId`, anchored coords, or `symbol` — no file-only expansion.
- `code_impact`: `targetId` is the only public target selector.
- Extract operations require 1-based `range` + `newName`; coordinates converted to LSP ranges internally.

### Target resolution and handles
- `code_resolve` and `code_orientation` coordinate mode share the same `resolveAnchoredSymbolTarget` → `target-store.ts` path. Never produces anonymous `name:null` point targets (ADR 0003).
- Target IDs (`tg-*`) deterministic while file fingerprint unchanged; position excluded from hash. No cross-session persistence. Unknown/stale IDs return explicit unavailable — no silent fallthrough.

### Composite provider contract
- `createCompositeProvider` in `src/analysis/provider.ts` wraps `StructuralProvider` + `SemanticProvider`. When provider contracts change, update the wrapper method list and `provider-compatibility.test.ts`.

### Test discovery
- `src/analysis/tests/test-discovery.ts` is single source of truth. `code_graph` and `code_impact` share it — any divergent lookup is a bug.
- Provenance: `"semantic+conventions"` (semantic references contributed) or `"conventions-only"`. Describes file discovery only, not label extraction.
- `conventions-only` + zero files → `unavailable` only when no semantic/structural support exists; otherwise honest empty result. Zero recognized test blocks → `_(no recognized test blocks)_` placeholder.

### Impact seeding & evidence
- Target-based `code_impact` seeds the target file itself as affected (zero references still reports own file).
- `changeSetFiles` impact appends evidence note: `semantic+structural` when semantic refs contributed, otherwise `structural`.

### Refactor safety
- `validateEdit()` rejects empty edits and invalid ranges. Plans revalidate SHA-256 fingerprints + ranges before apply. `withFileMutationQueue` per ADR 0006; cross-file rollback preserved.
- No heuristic text fallback for refactors.

### First-turn overview
- Injected via `before_agent_start` with `display: false` (agent-visible, TUI-invisible). Deduplicated by `hasInjectedOverview`. Reload/resume scans for existing `code-intelligence-overview` custom message.

## License

MIT
