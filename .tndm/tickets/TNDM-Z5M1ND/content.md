## Problem

When a new .ts/.tsx source file is created (e.g., via Write tool), then another file imports from it, cross-file diagnostics (like "Cannot find module './NewFile'") persist indefinitely — even across `lsp recover` tool calls. The diagnostic only clears when the importing file is itself edited (actual content change).

## Root Cause

The TypeScript language server caches diagnostics by file content hash. When `before_agent_start` runs `refreshOpenDiagnostics`, it re-reads each open file and sends `didChange` with identical content. The server treats this as a no-op and returns cached diagnostics. The `workspace/didChangeWatchedFiles` notification for the newly created file doesn't trigger immediate re-analysis of already-open importing files.

For pull diagnostics: server returns `unchanged` (keeping stale diagnostics). For push diagnostics: no new `publishDiagnostics` fire, so `waitForDiagnosticSettle` resolves immediately with stale data.

## Recommended Approach

Force re-open files with module-resolution errors after workspace changes.

After `refreshOpenDiagnostics` in `before_agent_start`, check for outstanding "Cannot find module" diagnostics. For each affected file, do `didClose` + `didOpen` against the LSP client, then re-run `refreshOpenDiagnostics` to settle fresh diagnostics.

Since the newly created file is already open (opened during the write tool's `appendInlineDiagnostics`), re-opening the importing file forces the server to re-resolve all imports — and the new file is visible.

## Changes

1. **stale-diagnostics.ts** — Export `isLikelyStaleDiagnostic` predicate
2. **manager-stale-resync.ts** (new) — `forceResyncStaleModuleFiles()` function
3. **lsp.ts** — Call the new function in `before_agent_start` after the refresh cycle
4. **Tests** — New test file for the re-sync function

## Edge Cases

- Zero stale diagnostics: no-op, no delay
- Multiple stale files: each cycled in sequence
- Push vs pull: `refreshOpenDiagnostics` handles both
- File deleted during re-sync: `ensureFileOpen` bails via existsSync
- LSP server errors: caught silently