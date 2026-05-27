# Task 5: Update Phase 1 docs and maintainer guidance

# Goal

Document that `code_resolve` is now active, target IDs are available, and later V2 workflow tools remain planned but inactive.

# Files

Modify:

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

# Changes

## README

Update the public user-facing docs to include:

- `code_resolve` in the installed tool list
- a `code_resolve` tool overview section
- short examples of resolving a symbol/file and using the returned `targetId` in follow-up current tools
- V2 roadmap wording that says Phase 1 activates `code_resolve`; remaining V2 workflow tools are still planned
- confirmation that `lsp_*` and `tree_sitter_*` expert tools remain public in Phase 1

## CLAUDE

Update maintainer notes to include:

- current public tool surface includes `code_resolve`
- `src/workflow/target-store.ts`, `src/analysis/resolve/service.ts`, `src/tool/execute-resolve.ts`, `src/tool/target-id-params.ts`, and `src/presentation/markdown/resolve.ts` in the architecture tree
- Phase 1 rules: target IDs are session-scoped, current target-oriented tools may accept `targetId`, later V2 tools remain unregistered
- gotchas for stale/unknown target IDs and no cross-session persistence

# Test exemption

Docs-only task. TDD is not practical, but the docs can be verified by direct grep and package docs lint through Biome.

# Verification

```bash
rg -n "code_resolve|targetId|Phase 1|src/workflow/target-store|code_context|code_health" packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Expected result: grep shows the new Phase 1 and targetId documentation; Biome passes for the changed docs.
