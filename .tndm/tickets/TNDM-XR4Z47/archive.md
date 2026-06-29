# Archive

## Verification results

### Full test suite
```
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
```
Result: 37/39 test files passed, 329/333 tests passed. 2 files / 4 tests skipped (optional integration tests).

### TypeScript typecheck
```
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```
Result: clean, no errors.

### Biome lint/format
```
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20
```
Result: clean, 149 files, no fixes applied.

### Fixes applied (7 tasks, all TDD RED→GREEN)

1. **File-only resolve semantic provider** — `resolveFileOnlyInput()` and `resolvePathQuery()` now pass both `{ semantic, structural }` to `resolveFileTargetGroup()`. Also fixed `resolveViaSemantic` to prefer semantic symbols by position-based dedup instead of name-matching.

2. **Kind mapping** — "symbol" → no filter, "export" → exportedOnly:true, "command"/"setting" → explicit unsupported error. All other kinds pass through to the existing filter.

3. **Schema alignment** — `LineParam`/`CharacterParam` got `minimum: 1`. `kind` in `CodeResolveParameters` uses `StringEnum` matching the workflow schema.

4. **maxResults threading** — `maxResults` added to `resolveSymbolTarget` options, threaded from `executeResolveService` through `resolveQueryTarget`. Default caps at 8, respects provided maxResults.

5. **Target store staleness** — `getWorkflowTarget` re-fingerprints unfingerprinted entries at lookup. Files that are gone/unreadable return `unavailable`. Existing tests updated to create backing files.

6. **Disambiguation markdown** — `code_context` suggestion replaced with `code_brief` (registered in Phase 1).

7. **Review follow-up** — Removed dead `_stat` double-read in `computeFileFingerprint`.

### Docs updated
- README.md: `code_resolve` added to "What you get" list, Phase 1 activation documented, targetId conventions documented, source tree updated.
- CLAUDE.md: Phase 1 activation, code_resolve contract, target handles gotchas, updated architecture diagram.
