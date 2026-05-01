## 1. Package scaffolding

- [ ] 1.1 Create `packages/supi-code-intel/` with `package.json` (name `@mrclrchtr/supi-code-intel`, dependencies on `supi-lsp`, `supi-core`, peer deps on `pi-coding-agent`, `pi-tui`, `typebox`)
- [ ] 1.2 Create `packages/supi-code-intel/tsconfig.json` following existing workspace patterns
- [ ] 1.3 Run `pnpm install` to wire the new workspace package into the lockfile

## 2. Project scanner

- [ ] 2.1 Create `lib/scanner.ts` — scan workspace `package.json` files for module names, descriptions, and dependency edges
- [ ] 2.2 Add directory layout scanning (top-level `packages/`, `src/`, or configurable roots)
- [ ] 2.3 Add LSP-based public API extraction using `documentSymbols` on entry-point files
- [ ] 2.4 Unit tests for scanner with fixture workspace structures

## 3. Architecture brief generation

- [ ] 3.1 Create `lib/brief.ts` — generate a full architecture brief from scanner output + LSP symbols
- [ ] 3.2 Generate lightweight overview variant (under 500 tokens) for auto-injection
- [ ] 3.3 Generate focused brief variant for a specific path (public APIs, deps, dependents, entry points, patterns)
- [ ] 3.4 Unit tests for brief formatting and token targeting

## 4. Smart search

- [ ] 4.1 Create `lib/search.ts` — implement `callers` action using LSP references, grouped by file with summary
- [ ] 4.2 Implement `implementations` action using LSP symbols and cross-reference
- [ ] 4.3 Implement `pattern` action wrapping `rg` with structured output and context lines
- [ ] 4.4 Add output truncation using `truncateHead` from `pi-coding-agent`
- [ ] 4.5 Add graceful fallback messaging when LSP is unavailable for semantic actions
- [ ] 4.6 Unit tests for search result formatting, grouping, and truncation

## 5. Affected analysis

- [ ] 5.1 Implement `affected` action — aggregate LSP references for a symbol, group by module
- [ ] 5.2 Add transitive dependency chain analysis (direct refs + downstream dependents)
- [ ] 5.3 Add risk assessment (low/medium/high) based on affected file and module count
- [ ] 5.4 Unit tests for affected analysis with mock dependency graphs

## 6. Extension entry point

- [ ] 6.1 Create `code-intel.ts` — register the `code_intel` tool with `StringEnum` action parameter, `promptSnippet`, and `promptGuidelines`
- [ ] 6.2 Wire `before_agent_start` handler for auto-injecting the lightweight overview (first turn only)
- [ ] 6.3 Add `session_shutdown` handler for cleanup
- [ ] 6.4 Add extension to root `package.json` pi manifest (`extensions` array)

## 7. Integration and verification

- [ ] 7.1 Run `pnpm typecheck` and fix any type errors
- [ ] 7.2 Run `pnpm biome:fix && pnpm biome:ai` and fix lint issues
- [ ] 7.3 Run `pnpm test` and ensure all tests pass
- [ ] 7.4 Run `pnpm verify` for full workspace validation
- [ ] 7.5 Manual test: load pi in the supi repo, verify `code_intel` tool appears, test each action
