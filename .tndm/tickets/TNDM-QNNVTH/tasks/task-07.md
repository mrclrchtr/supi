# Task 7: Update library-surface docs for the code-only public model

## Goal
Bring remaining user-facing and maintainer-facing docs into alignment with the actual architecture: `supi-code-intelligence` owns the public `code_*` surface, while `supi-tree-sitter` is a library-only substrate.

## Files
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`

## Change
Update the two tree-sitter docs so they no longer imply standalone activation of public `tree_sitter_*` tools. Describe the package consistently as a library-only structural substrate consumed by `@mrclrchtr/supi-code-intelligence`, and keep the wording aligned with the already-updated code-intelligence docs from earlier tasks.

## Verification
This task is test-exempt because it is docs-only. Verify with a focused wording audit:

```bash
rg -n "activate the `tree_sitter_\\*` tool family|After install, pi gets \*\*6 focused tools\*\*|tree_sitter_outline|tree_sitter_imports|tree_sitter_exports|tree_sitter_node_at|tree_sitter_query|tree_sitter_callees" \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md
```

Expected result: no stale public-activation wording remains in these docs.

## Test mode
Test-exempt (docs-only). Rationale: no meaningful automated harness is needed beyond the wording audit above.
