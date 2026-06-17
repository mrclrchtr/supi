# Full tree-sitter scan for structured pattern search (no ripgrep pre-filter)

Structured pattern search (`code_find` with a `kind`) previously used a ripgrep text-match to pre-filter candidate files before running tree-sitter on them. We replaced this with a full tree-sitter scan of all source files, gated only by a 10-second timeout and a 5000-file soft cap.

## Why

The ripgrep pre-filter introduced a false-negative risk: if ripgrep didn't text-match a file, tree-sitter never saw it, even if tree-sitter would have found the structural match (e.g., an export whose name differs from its declaration text). The old 200-file cap also silently truncated results on repos with more than 200 source files.

Tree-sitter per-file queries (outline, exports, imports, call-sites) are fast enough that a full scan completes within the timeout for most repos. When it doesn't, partial results with an explicit timeout warning are more honest than silent truncation.

## Considered Options

- **Ripgrep pre-filter (removed)**: Fast but lossy — text-match gating can miss structural matches in principle. Favored speed over recall.
- **Filesystem walk + cap (removed)**: Guaranteed file-level coverage within the cap but truncated silently at 200 files.
- **Full tree-sitter scan (chosen)**: Guaranteed to see every source file. Fast enough in practice. Timeout as honest backstop.
- **Hybrid — ripgrep for `call` only**: Would have kept ripgrep for the non-tree-sitter `call` kind. Rejected because `call` was converted to tree-sitter via a new `callSites()` method.

## Consequences

- File enumeration uses `rg --files` with a `-g` glob built dynamically from `getSupportedExtensions()` on the TreeSitterService — covers all grammars with vendored WASM, not just TS/JS. Respects `.gitignore` (no manual skip-dir list).
- Added `callSites(file)` to `StructuralProvider` / `TreeSitterService`, replacing the regex-based `collectCallSitesInFile`.
- Added `getSupportedExtensions()` to `supi-tree-sitter/api` so callers can enumerate supported file extensions without importing internal maps.
- Parse failures during the scan are surfaced to the user rather than silently skipped.
