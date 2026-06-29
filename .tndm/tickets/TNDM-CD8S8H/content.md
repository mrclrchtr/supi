# Clean Internal Layering

Delete ~40 dead files and one-hop re-export forwarders in `packages/supi-code-intelligence/src/`. No public surface changes, no code refactoring within files.

## Phase 1: Delete dead files (11)

Files with zero non-test callers:
- `analysis/affected/service.ts`
- `analysis/pattern/service.ts`
- `analysis/map/service.ts`
- `analysis/refactor/service.ts`
- `analysis/architecture/model-service.ts`
- `analysis/architecture/model-cache.ts`
- `analysis/relations/service.ts`
- `analysis/relations/types.ts`
- `tool/execute-relations.ts`
- `tool/execute-refactor.ts`
- `use-case/generate-relations.ts`

Update any test imports that reference these deleted files.

## Phase 2: Move real code out of families

Two files in `tool/families/tree-sitter/` contain real implementations:
- `execute.ts` — handleOutline, handleImports, handleExports, handleNodeAt, handleQuery, handleCallees
- `format.ts` — formatOutlineItemsCapped, formatNonSuccess, truncate, etc.

Move these to `tree-sitter/` directory and update the one importer (`tree-sitter/tool-actions.ts`).

## Phase 3: Collapse forwarders

For each forwarder, update all importers to the canonical path, then delete the forwarder:

| Forwarder (delete) | Canonical (keep) |
|---|---|
| `planner/planner.ts` | `analysis/routing/planner.ts` |
| `resolve-target.ts` | `analysis/targeting/resolve-target.ts` |
| `workspace/request-context.ts` | `analysis/context/request-context.ts` |
| `refactor/safety.ts`, `refactor/apply-workspace-edit.ts` | `analysis/refactor/safety.ts`, `analysis/refactor/apply-workspace-edit.ts` |
| `substrate/semantic/*` (6) | `lsp/*` |
| `substrate/structural/*` (2) | `tree-sitter/*` |
| `tool/families/code/*` (5) | `tool/*` |
| `tool/families/lsp/*` (4) | `lsp/*` |
| `tool/families/tree-sitter/*` (3 remaining) | `tree-sitter/*` |

## Phase 4: Update exports and docs

- `index.ts` and `api.ts` — update export paths from forwarder locations to canonical
- `CLAUDE.md` — update architecture diagram
- `README.md` — verify no stale references

## Phase 5: Verify

- `pnpm vitest run packages/supi-code-intelligence/`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-intelligence`
