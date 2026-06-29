# Task 3: Collapse all remaining forwarders (planner, resolve-target, request-context, refactor, substrate, families/code, families/lsp)

Collapse all remaining forwarder chains:

1. `planner/planner.ts` → update 7 importers to `analysis/routing/planner.ts`, delete forwarder
2. `resolve-target.ts` → update `generate-affected.ts`, delete forwarder
3. `workspace/request-context.ts` → update ~12 importers to `analysis/context/request-context.ts`, delete forwarder
4. `refactor/safety.ts` + `refactor/apply-workspace-edit.ts` → update remaining consumers to `analysis/refactor/`, delete both forwarders
5. `substrate/semantic/*` (6 files) → update `code-intelligence.ts` to import from `lsp/*`, delete
6. `substrate/structural/*` (2 files) → update `code-intelligence.ts` to import from `tree-sitter/*`, delete
7. `tool/families/code/*` (5 files) → update `code-intelligence.ts` to import from `tool/*`, delete
8. `tool/families/lsp/*` (4 files) → update `code-intelligence.ts` to import from `lsp/*`, delete

Remove empty directories: `planner/`, `refactor/`, `substrate/`, `tool/families/`
