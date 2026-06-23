# Code Intelligence V2 Phase 1: `code_resolve` target handles

## Problem

Phase 0 (`TNDM-JSDGJP`) added the internal V2 workflow skeleton, but no active V2 tools. The next coherent phase is to make the first workflow tool real: `code_resolve`.

Today the model must repeatedly pass fragile `file` / `line` / `character` / `symbol` fields into each code-intelligence tool. Phase 1 should introduce stable session-scoped target handles so later workflow phases can link tool calls through `targetId` instead of repeated coordinates.

## Scope

Implement `code_resolve` as the first active V2 workflow tool and make target handles practically usable by current high-level `code_*` tools.

In scope:

- Register public `code_resolve` from the existing Phase 0 schema.
- Resolve three input shapes:
  - anchored: `file` + `line` + `character`
  - file-level: `file` without coordinates
  - query/symbol: `query` with optional `scope` and `kind`
- Return target IDs for resolved targets and disambiguation candidates.
- Store target handles in a session/workspace-scoped in-memory registry.
- Add optional `targetId` support to existing target-oriented code tools where it naturally maps to anchored coordinates:
  - `code_brief`
  - `code_references`
  - `code_calls`
  - `code_implementations`
  - `code_affected`
  - `code_refactor_plan`
- Keep all existing current tools and substrate tools active.
- Keep later V2 tools (`code_context`, `code_find`, `code_graph`, `code_impact`, `code_refactor`, `code_apply`, `code_health`) non-registered.

Out of scope:

- Do not remove or demote public `lsp_*` or `tree_sitter_*` tools in this phase.
- Do not rename `code_brief`, `code_pattern`, `code_affected`, or rename plan/apply yet.
- Do not implement `code_context`, `code_find`, `code_graph`, `code_impact`, `code_refactor`, `code_apply`, or `code_health`.
- Do not persist handles across process/session restarts.
- Do not add natural-language search or generic code planning.

## Design

### Tool behavior

`code_resolve` accepts the Phase 0 schema:

- `query?: string`
- `scope?: string`
- `kind?: "symbol" | "function" | "class" | "interface" | "type" | "file" | "export" | "command" | "setting"`
- `file?: string`
- `line?: number`
- `character?: number`
- `maxResults?: number`

Runtime validation:

- require either `query` or `file`
- `line` and `character` must be provided together
- `line` / `character` require `file`
- `scope` limits query/symbol resolution only
- unsupported `kind` values are rejected by TypeBox schema before executor logic

Resolution policy:

1. Anchored input uses the existing anchored target resolver.
2. File-only input uses existing file target discovery: semantic document symbols plus structural exports fallback.
3. Query input uses semantic workspace symbol discovery. `kind` maps to the existing symbol-kind filter; `scope` maps to current path scoping.
4. If `kind: "file"` and `query` looks like a path, the resolver may attempt direct file resolution before symbol lookup; this should be simple and bounded.
5. Ambiguous results return ranked candidates with `targetId`s rather than only text instructions.

### Handles and store

Phase 1 should add a small in-memory target store, keyed by normalized cwd:

- `targetId`: handle for one resolved target
- `spanId`: handle for the concrete file/range backing the target
- entry data: file, LSP position, display line/character, name, kind, confidence, provenance, and file fingerprint

Handle requirements:

- Opaque strings in user output.
- Stable within the current process/session for the same target shape.
- Reused if the same target is resolved repeatedly and the file fingerprint is unchanged.
- Invalid or stale IDs should produce explicit errors when used later.

The store is intentionally session-scoped in Phase 1. Cross-session persistence is not required.

### Existing-tool compatibility

Existing target-oriented tools should accept `targetId?: string` in addition to their current parameters. Runtime helpers expand a valid target ID into the existing `file` / `line` / `character` shape before current executor logic runs.

Compatibility rules:

- If `targetId` is provided, it takes precedence over `file` / `line` / `character` / `symbol`.
- `code_calls` can become `targetId` OR anchored coordinates; it should still reject unanchored requests.
- `code_refactor_plan` can use `targetId` plus `operation` and `newName`; `targetId` supplies the file and position.
- Unknown, stale, or out-of-workspace target IDs return explicit errors.

### Result shape

Add a `ResolveDetails` metadata shape to `CodeIntelResult`.

Minimum details fields:

- confidence
- target count
- omitted count
- resolved target summaries
- disambiguation candidates when present
- next query/action suggestions

Markdown should be compact and agent-friendly:

- show resolved file/range/symbol/kind
- show `targetId` and `spanId`
- for disambiguation, list candidates with `targetId`s and exact file positions
- include examples of follow-up current tools using `targetId`

## File map

Create:

- `packages/supi-code-intelligence/src/workflow/target-store.ts` — target/span handle generation, fingerprinting, lookup, clearing, and target-entry types.
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` — `code_resolve` business logic over existing targeting providers and the target store.
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` — markdown rendering for resolved, ambiguous, and error results.
- `packages/supi-code-intelligence/src/tool/execute-resolve.ts` — public tool executor for `code_resolve`.
- `packages/supi-code-intelligence/src/tool/target-id-params.ts` — shared helper for expanding `targetId` into existing target-oriented tool parameter shapes.
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` — registration/execution tests for `code_resolve`.
- `packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts` — target-store handle stability, lookup, and stale/error tests.

Modify:

- `packages/supi-code-intelligence/src/workflow/index.ts` — export target-store types/helpers needed by tests and future phases.
- `packages/supi-code-intelligence/src/workflow/surface.ts` — mark `code_resolve` as Phase 1 active in docs/metadata without changing future tool names.
- `packages/supi-code-intelligence/src/types.ts` — add `ResolveDetails` and include it in `CodeIntelResult`.
- `packages/supi-code-intelligence/src/intent/types.ts` — add `code_resolve` to current registered tool names.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — add `code_resolve` spec and optional `targetId` fields to target-oriented current tool schemas.
- `packages/supi-code-intelligence/src/tool/guidance.ts` — add guidance for `code_resolve` and targetId follow-up usage.
- `packages/supi-code-intelligence/src/tool/execute-brief.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/src/tool/execute-references.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/src/tool/execute-calls.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/src/tool/execute-implementations.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/src/tool/execute-affected.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts` — support `targetId` expansion.
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — assert `code_resolve` is registered and only the remaining V2 workflow tools are still unregistered.
- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts` — keep the V2 surface contract while allowing `code_resolve` activation.
- `packages/supi-code-intelligence/README.md` — document `code_resolve`, targetId usage, and Phase 1 status.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer notes and file tree for Phase 1.

## Testing strategy

Use TDD for behavior:

1. Add failing tests for `code_resolve` registration, validation, anchored/file/query resolution, disambiguation target IDs, and target-store stability.
2. Implement the target store and resolve service until those tests pass.
3. Add failing tests for `targetId` compatibility in at least `code_references`, `code_calls`, `code_affected`, and `code_refactor_plan`.
4. Wire targetId expansion into the current tools until tests pass.
5. Update docs and registration tests.
6. Run focused package verification and the accepted Biome baseline check.

Verification commands:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
```

## Success criteria

- `code_resolve` is active and registered.
- `code_resolve` returns target IDs for anchored, file-level, and symbol/query resolution.
- Ambiguous query results include target IDs for every shown candidate.
- Target IDs can be used by current target-oriented tools instead of repeating file/line/character.
- All non-`code_resolve` V2 workflow tools remain unregistered.
- Existing current tools and public substrate tools remain active.
- README and CLAUDE accurately describe Phase 1 behavior and future phase boundaries.
- Focused tests, package tests, typecheck, and Biome baseline verification pass.
