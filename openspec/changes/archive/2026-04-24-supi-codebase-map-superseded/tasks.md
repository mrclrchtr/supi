## 1. Extract shared utilities from supi-lsp to supi-core

- [ ] 1.1 Create `packages/supi-core/project-roots.ts` with `walkProject`, `dedupeTopmostRoots`, `findProjectRoot`, `sortRootsBySpecificity`, `mergeKnownRoots`, `resolveKnownRoot`, `isWithin`, `byPathDepth`, `segmentCount` — moved from `supi-lsp/scanner.ts`, `supi-lsp/utils.ts`, and `supi-lsp/manager-roots.ts`
- [ ] 1.2 Export all functions from `packages/supi-core/index.ts`
- [ ] 1.3 Update `supi-lsp/scanner.ts` to import `walkProject`, `dedupeTopmostRoots` from `supi-core`
- [ ] 1.4 Update `supi-lsp/utils.ts` to import `findProjectRoot` from `supi-core`
- [ ] 1.5 Update `supi-lsp/manager-roots.ts` to import `buildKnownRootsMap`, `mergeKnownRoots`, `resolveKnownRoot` from `supi-core`
- [ ] 1.6 Remove the now-unused local implementations from supi-lsp files
- [ ] 1.7 Run `pnpm typecheck` and `pnpm test` to verify no regressions in supi-lsp

## 2. Create supi-codebase-map package scaffold

- [ ] 2.1 Create `packages/supi-codebase-map/package.json` with name `@mrclrchtr/supi-codebase-map`, dependencies on `supi-core`, optional peer dependency on `supi-lsp`
- [ ] 2.2 Create `packages/supi-codebase-map/codebase-map.ts` — main extension entry point with `session_start` handler and tool registration
- [ ] 2.3 Add `supi-codebase-map` to the root `package.json` pi manifest extensions array
- [ ] 2.4 Create `packages/supi/codebase-map.ts` re-export shim
- [ ] 2.5 Run `pnpm install` to refresh workspace links

## 3. Implement module marker configuration

- [ ] 3.1 Create `packages/supi-codebase-map/markers.ts` — broad marker set mapping marker files to language names (package.json → JS/TS, Cargo.toml → Rust, go.mod → Go, pyproject.toml → Python, etc.)
- [ ] 3.2 Create `packages/supi-codebase-map/detector.ts` — uses `walkProject` from supi-core with the broad marker set to detect module roots, deduplicates via `dedupeTopmostRoots`, detects languages per root

## 4. Implement regex-based import extraction

- [ ] 4.1 Create `packages/supi-codebase-map/extractors/` directory for per-language import patterns
- [ ] 4.2 Create `packages/supi-codebase-map/extractors/types.ts` — define `ImportMatch`, `ExportMatch`, and `LanguageExtractor` interfaces
- [ ] 4.3 Create `packages/supi-codebase-map/extractors/javascript.ts` — JS/TS import/require/dynamic import patterns
- [ ] 4.4 Create `packages/supi-codebase-map/extractors/python.ts` — Python import/from-import patterns
- [ ] 4.5 Create `packages/supi-codebase-map/extractors/rust.ts` — Rust use/mod patterns
- [ ] 4.6 Create `packages/supi-codebase-map/extractors/go.ts` — Go import patterns
- [ ] 4.7 Create `packages/supi-codebase-map/extractors/ruby.ts` — Ruby require/require_relative patterns
- [ ] 4.8 Create `packages/supi-codebase-map/extractors/java.ts` — Java/Kotlin import patterns
- [ ] 4.9 Create `packages/supi-codebase-map/extractors/index.ts` — registry mapping file extensions to extractors

## 5. Implement dependency graph builder

- [ ] 5.1 Create `packages/supi-codebase-map/graph.ts` — resolve relative imports to file paths, map files to module roots, build module-to-module dependency graph, classify imports as internal/external/cross-module
- [ ] 5.2 Add file-level scan mode that produces per-file import/export breakdown with internal cross-reference graph

## 6. Implement session-start prompt injection

- [ ] 6.1 Create `packages/supi-codebase-map/format.ts` — format module-level dependency graph as compact text suitable for system prompt injection
- [ ] 6.2 Wire `session_start` handler in `codebase-map.ts`: run detector, build graph, format, inject via `promptGuidelines` using `<extension-context>` tag from supi-core
- [ ] 6.3 Handle empty project case (no injection when no modules detected)

## 7. Implement codebase_map tool

- [ ] 7.1 Define tool schema with `focus` (optional string) and `depth` (optional enum: `module` | `file`, default `module`) parameters
- [ ] 7.2 Implement module-depth handler: return dependency subgraph for focus area, include reverse dependencies
- [ ] 7.3 Implement file-depth handler: return per-file imports, exports, and internal graph for focus area
- [ ] 7.4 Add optional LSP enrichment: when supi-lsp is available and depth is `file`, use `documentSymbol` for accurate exports and `references` for callers (best-effort, fallback to regex)

## 8. Tests

- [ ] 8.1 Test detector: module boundary detection with various marker configurations (monorepo, single module, mixed language)
- [ ] 8.2 Test extractors: per-language regex patterns with representative import/export statements
- [ ] 8.3 Test graph builder: relative import resolution, module mapping, internal/external classification
- [ ] 8.4 Test formatter: compact output format for module-level and file-level maps
- [ ] 8.5 Test session_start handler: prompt injection with and without detected modules
- [ ] 8.6 Test tool: module and file depth responses for various focus paths
- [ ] 8.7 Run `pnpm biome:fix && pnpm biome:ai` on all new files
- [ ] 8.8 Run `pnpm verify` to confirm full suite passes
