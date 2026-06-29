# Generalize code_refactor plan/apply beyond rename

## Summary

Generalize the current `code_refactor_plan` / `code_refactor_apply` flow from rename-only into an operation-aware refactor engine while keeping the current public tool names stable for now.

The first wave should stay substrate-honest and limited to operations that can already be expressed as **precise text edits** from the current semantic substrate:

- `rename_symbol`
- `update_imports`
- `delete_dead_code`

Keep legacy `operation: "rename"` as a compatibility alias for `rename_symbol`.

`rename_file` and `move_file` should remain **explicit unavailable** in this ticket instead of being faked with search/replace or partial filesystem edits. True file/resource operations need a broader workspace-edit and rollback model across `supi-code-runtime`, `supi-lsp`, and `supi-code-intelligence`.

## Assumptions

- Keep the current public tools: `code_refactor_plan` and `code_refactor_apply`.
- Do **not** activate planned V2 public names `code_refactor` / `code_apply` yet.
- Do **not** add heuristic fallback or arbitrary code-action application.
- Only precise text-edit results become stored plans in this ticket.

## Scope check

This work naturally splits into two tracks:

1. **Text-edit refactors** — `rename_symbol`, `update_imports`, `delete_dead_code`
2. **Resource/file ops** — `rename_file`, `move_file`

Recommended scope for this ticket: **track 1 only**.

That keeps the change coherent, testable, and aligned with the current plan/apply engine. Resource/file ops should be a follow-up ticket once shared workspace-edit resource operations and rollback semantics exist.

## Design

### User-visible behavior

`code_refactor_plan` becomes operation-aware, but still preview-only:

- `rename_symbol` → semantic rename plan
- `update_imports` → organize/import-cleanup style plan when the provider can return a precise edit
- `delete_dead_code` → dead-code/unused-symbol cleanup plan when the provider can return a precise edit
- `rename` → compatibility alias for `rename_symbol`
- `rename_file` / `move_file` → explicit unavailable result in this ticket

`code_refactor_apply` remains planId-based and operation-agnostic. It should still reject stale or invalid plans and apply only validated, precise text edits.

### Provider strategy

Push operation selection into the semantic-provider layer instead of hard-coding more substrate branching into the tool executor.

- `rename_symbol` uses the existing semantic rename path.
- `update_imports` uses code actions filtered to import-organization/source actions that yield precise edits.
- `delete_dead_code` uses code actions filtered to dead-code/unused-symbol fixes that yield precise edits.
- `rename_file` / `move_file` return explicit unavailable results for now.

### Safety and apply rules

Keep the current safety guarantees:

- no empty plans
- no overlapping edits
- no out-of-bounds edits
- stale-plan rejection via file fingerprints
- transactional apply for text edits

Do **not** expand the apply path to file/resource operations in this ticket.

## File structure map

### Shared runtime / provider contracts
- `packages/supi-code-runtime/src/types.ts` — shared refactor operation/request/result metadata for operation-aware planning
- `packages/supi-code-runtime/src/capability/types.ts` — semantic provider contract for generic refactor planning
- `packages/supi-code-runtime/src/api.ts` — export any new shared refactor types
- `packages/supi-code-runtime/src/index.ts` — keep runtime export surface aligned if needed

### LSP substrate
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — map operation requests to rename/code-action flows; only return precise edits
- `packages/supi-lsp/src/session/service-registry.ts` — expose any extra code-action filtering or range behavior needed by operation-aware refactors
- `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts` — lock operation mapping and precise-edit behavior
- `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts` — update only if the provider interface change ripples here

### Code-intelligence public surface and plan/apply internals
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — widen refactor operation enum / params while keeping current public tool names
- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts` — dispatch operation-aware planning
- `packages/supi-code-intelligence/src/tool/execute-refactor-apply.ts` — keep generic apply behavior/messages aligned with non-rename ops
- `packages/supi-code-intelligence/src/analysis/refactor/plan-store.ts` — generic plan metadata instead of rename-specific storage
- `packages/supi-code-intelligence/src/analysis/refactor/safety.ts` — keep validating precise text edits only
- `packages/supi-code-intelligence/src/analysis/refactor/apply-workspace-edit.ts` — keep transactional text-edit apply path; adjust only as required by generic plan metadata
- `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts` — generic preview/apply rendering for multiple operations
- `packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts` — end-to-end plan/apply behavior for first-wave ops
- `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts` — safety and unsupported-operation behavior
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — public tool schema expectations remain stable
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` — update only if follow-up examples/assertions hard-code rename naming

### Docs / maintainer guidance
- `packages/supi-code-intelligence/README.md` — describe first-wave operation-aware refactor planning
- `packages/supi-code-intelligence/CLAUDE.md` — maintainers: operation-aware plan/apply behavior and deferred file ops
- `packages/supi-code-runtime/CLAUDE.md` — document the widened shared refactor/provider contract
- `packages/supi-lsp/CLAUDE.md` — document how operation-aware refactor requests map onto rename/code-action substrate behavior

## Non-goals

- Do not register `code_refactor` / `code_apply` yet.
- Do not implement `rename_file` / `move_file` with heuristic search-and-replace.
- Do not add arbitrary code-action apply.
- Do not weaken stale-plan, overlap, or bounds checks.

## Success criteria

- Current public tools stay `code_refactor_plan` / `code_refactor_apply`.
- `rename_symbol`, `update_imports`, and `delete_dead_code` can produce preview plans when precise edits exist.
- Legacy `rename` still works as an alias.
- Unsupported file/resource operations fail explicitly and honestly.
- Tests and docs describe the first-wave operation set and the deferred file/resource-op follow-up.
