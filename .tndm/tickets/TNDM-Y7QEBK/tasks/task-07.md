# Task 7: Update CLAUDE.md with new source layout

Update `packages/supi-lsp/CLAUDE.md`:

1. Source layout section: Add `handlers/` directory with its 4 files and `workspace-change.ts`
2. Note that `lsp.ts` is now a thin wire-up that delegates to handler modules
3. Update any stale references to handler functions that were previously described as being in `lsp.ts` (e.g., the behavioral handlers section)

No other documentation changes needed — this is an internal refactor with no user-facing impact.
