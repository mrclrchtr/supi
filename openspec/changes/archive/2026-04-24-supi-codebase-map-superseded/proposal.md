## Why

Agents entering a codebase lack structural understanding — they flail through file reads and greps to build a mental model of modules, dependencies, and public APIs. A compact, pre-computed codebase map injected at session start gives agents immediate architectural context, reducing noisy exploration and enabling more targeted, confident changes.

## What Changes

- New package `packages/supi-codebase-map` — a pi extension that scans the project at session start, extracts import dependencies via language-agnostic regex patterns, and injects a module-level dependency map into the system prompt via `promptGuidelines`.
- New registered tool `codebase_map` — on-demand drill-down with `--focus` (file or directory) and `--depth` (`module` | `file`) parameters. Module depth shows inter-module dependencies for the focus area; file depth shows per-file imports, exports, and internal cross-references.
- Extract shared root detection utilities (`walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, `isWithin`, `sortRootsBySpecificity`) from `supi-lsp` into `supi-core` so both extensions reuse the same project scanning infrastructure.
- Broader module marker set than LSP uses — covers all known project root markers (Makefile, Gemfile, composer.json, etc.), not just those with language servers.

## Capabilities

### New Capabilities
- `codebase-map-scan`: Project scanning and module boundary detection using root markers and regex-based import extraction across multiple languages. Produces a structured dependency graph.
- `codebase-map-injection`: Formatting and injecting the module-level map into the system prompt at session start via `promptGuidelines`.
- `codebase-map-tool`: Registered `codebase_map` tool for on-demand exploration at module or file granularity.

### Modified Capabilities
- `lsp-proactive-scan`: Root detection utilities (`walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, `isWithin`, `sortRootsBySpecificity`) move from `supi-lsp` to `supi-core`. supi-lsp imports them from supi-core instead of defining them locally. No behavior change — pure extraction.

## Impact

- **New package**: `packages/supi-codebase-map/` with dependencies on `supi-core` and optional peer dependency on `supi-lsp` (for deep mode enrichment via LSP documentSymbol/references).
- **Modified package**: `supi-lsp` — removes `walkProject`, `dedupeTopmostRoots`, `isWithin`, `sortRootsBySpecificity`, `byPathDepth`, `segmentCount` from `scanner.ts`; removes `findProjectRoot` from `utils.ts`; removes `buildKnownRootsMap`, `mergeKnownRoots`, `resolveKnownRoot`, `sortRootsBySpecificity` (private), `isWithinOrEqual` from `manager-roots.ts`. All re-imported from `supi-core`.
- **Modified package**: `supi-core` — gains new exports for shared root detection utilities.
- **Root manifest**: `package.json` pi manifest gains `supi-codebase-map` entry.
- **Meta-package**: `packages/supi/` re-exports the new extension.
- **System prompt**: adds ~200-400 tokens of compact module-level map content per session.
