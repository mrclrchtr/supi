## Problem

When a new .ts/.tsx file is created (e.g. via Write tool), then another file imports from it, the LSP diagnostic layer reports `Cannot find module './NewFile'` — correctly at first, since the file doesn't exist yet. But after the imported file is written, the diagnostic persists indefinitely, even across `lsp recover` calls.

## Evidence

Observed in octalog-next repo (TNDM-D26KAG implementation):

1. Created `QuantityBarCell.test.tsx` which imports `./QuantityBarCell`
2. Diagnostic: `Cannot find module './QuantityBarCell'` — expected
3. Created `QuantityBarCell.tsx` — the module now exists
4. Ran `lsp recover` → `refreshed 4 clients, restarted 0 clients, stale diagnostics cleared`
5. Diagnostic persisted: same error remained
6. `pnpm typecheck:ai` passed with 0 errors throughout
7. Vitest resolved the import correctly (all tests passed)
8. Only cleared after a subsequent edit on the test file triggered re-analysis

## Root cause

Two factors:
1. **File-creation event race.** The LSP server's file watcher may not register the new file before the diagnostic snapshot is taken.
2. **supi-lsp diagnostic caching.** The diagnostic presentation layer holds a per-file set. `lsp recover` restarts/refreshes clients but doesn't force a full project-reload for newly created files.

## Suggested fix

`lsp recover` (or a post-Write hook) should issue `textDocument/didOpen` or `didChangeWatchedFiles` for newly created files so the TS project service re-indexes the module graph.