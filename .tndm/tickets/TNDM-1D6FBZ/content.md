## Implementation Plan Overview

This redesign is **one coherent plan**, not several independent subsystems. The public-surface split, fallback removal, target-resolution cleanup, result-type changes, tests, and docs are tightly coupled. Splitting them would create temporary tool contracts that do not match the approved clean-break design.

## Target public surface

Replace the single `code_intel` tool with five focused tools:

- `code_brief` — interpretive orientation for project/package/directory/file/symbol scopes
- `code_map` — factual repo/package/directory inventory; accepts any directory path and rejects file paths
- `code_relations` — `kind: "callers" | "callees" | "implementations"`
- `code_affected` — semantic blast-radius / impact analysis
- `code_pattern` — explicit search only (literal, regex, or structured)

Clean-break rule: the final state must **not** register `code_intel`, and non-search tools must **not** fall back to ripgrep heuristics.

## File map

### Tool metadata and registration
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — **new** single source of truth for the five public tools, their schemas, snippets, and base guidance
- `packages/supi-code-intelligence/src/tool/guidance.ts` — derive tool guidance from `tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts` — **new** thin Pi adapter that registers the focused tools from shared specs
- `packages/supi-code-intelligence/src/code-intelligence.ts` — keep only overview injection + tool registration wiring

### Per-tool execution adapters
- `packages/supi-code-intelligence/src/tool/execute-brief.ts` — **new** adapter/validation for `code_brief`
- `packages/supi-code-intelligence/src/tool/execute-map.ts` — **new** adapter/validation for `code_map`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts` — **new** adapter/validation for `code_relations`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts` — **new** adapter/validation for `code_affected`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts` — **new** adapter/validation for `code_pattern`

### Domain actions and orchestration
- `packages/supi-code-intelligence/src/actions/brief-action.ts` — retain interpretive brief generation
- `packages/supi-code-intelligence/src/actions/map-action.ts` — **new** factual map action replacing `index-action.ts`
- `packages/supi-code-intelligence/src/actions/callers-action.ts` — semantic-only callers behavior
- `packages/supi-code-intelligence/src/actions/callees-action.ts` — structural-only callees behavior
- `packages/supi-code-intelligence/src/actions/implementations-action.ts` — semantic-only implementation behavior
- `packages/supi-code-intelligence/src/actions/affected-action.ts` — semantic + architecture-only impact behavior
- `packages/supi-code-intelligence/src/actions/pattern-action.ts` — explicit heuristic/structured search only
- `packages/supi-code-intelligence/src/resolve-target.ts` — constrain tool-target resolution to supported substrate paths
- `packages/supi-code-intelligence/src/target-resolution.ts` — remove non-search heuristic symbol fallback paths and keep disambiguation explicit

### Result contracts and exports
- `packages/supi-code-intelligence/src/types.ts` — replace the old `code_intel`-oriented detail unions with per-tool result/detail types
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`

### Obsolete files to remove or retire after cutover
- `packages/supi-code-intelligence/src/tool/action-specs.ts`
- `packages/supi-code-intelligence/src/tool-actions.ts`
- `packages/supi-code-intelligence/src/actions/index-action.ts`

### Tests and docs
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-actions.test.ts` (replace or repurpose around the new per-tool adapters)
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/semantic-file-target.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts`
- `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `docs/tool-architecture.md`

## Execution strategy

1. Land the multi-tool metadata and registration scaffolding first so the final cutover is driven by one tool-spec source of truth.
2. Implement `code_brief` and `code_map` next, because they define the public split between interpretive and factual orientation.
3. Rework relations and target resolution so callers/implementations are semantic-only and callees are structural-only.
4. Rework affected analysis so it stays semantic + architecture only, and keep `code_pattern` as the sole heuristic tool.
5. Cut over fully: remove `code_intel`, delete obsolete multiplexing files, update docs, and run package-wide verification.

Intermediate implementation work may temporarily keep internal compatibility while tests are moved, but the final state must be a true clean break.

## Verification expectations

- **TDD by default** for all logic-bearing tasks: update tests first, verify the failure, then implement the behavior.
- Non-search flows must never silently fall through to grep after the redesign.
- `code_map` must accept any directory path and reject file paths.
- `code_pattern` must remain the only tool that can return `heuristic` confidence.
- Final verification must include package-level Biome, source/test typechecks, and the full `packages/supi-code-intelligence/` Vitest suite.

## Constraints and non-goals

- No temporary long-lived `code_intel` shim in the final state
- No tool-per-action explosion beyond the approved five-tool surface
- `code_map` stays factual; no prioritized “start here” commentary
- Preserve the existing package layering: LSP = semantic substrate, Tree-sitter = structural substrate, Code Intelligence = orchestration layer
