# Task 4: Update docs and maintainer guidance for first-wave operation-aware refactors

# Task 4: Update docs and maintainer guidance for first-wave operation-aware refactors

## Goal

Bring user-facing and maintainer-facing docs in line with the new first-wave refactor behavior.

## Files

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-lsp/CLAUDE.md`

## Changes

1. Update `code_refactor_plan` docs from rename-only wording to operation-aware planning.
2. Document the first-wave supported operations:
   - `rename_symbol`
   - `update_imports`
   - `delete_dead_code`
   - legacy `rename` alias
3. Document that `rename_file` and `move_file` remain explicit unavailable outcomes in this ticket.
4. Clarify that `code_refactor_apply` still applies only stored, validated, precise text-edit plans.
5. Update maintainer guidance so future work on resource/file operations does not accidentally bypass the honest-unavailable rule.
6. While touching `packages/supi-code-intelligence/README.md`, remove any nearby stale surface wording that still implies public `lsp_*` / `tree_sitter_*` tools are active.

## Verification

**Test-exempt rationale:** this task is documentation-only.

Run a stale-phrasing audit and then review the changed markdown files manually:

```bash
rg -n 'semantic rename|only "rename" is supported|apply this rename|lsp_rename|lsp_code_actions|tree_sitter_' \
  packages/supi-code-intelligence \
  packages/supi-code-runtime \
  packages/supi-lsp
```

Expected result: stale rename-only phrasing and stale public-substrate-tool wording are removed or limited to intentional historical/maintainer notes.

Manual check: confirm the four documentation files describe the same first-wave operation set and the same deferral of file/resource operations.
