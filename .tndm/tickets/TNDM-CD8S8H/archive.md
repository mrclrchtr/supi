# Archive

## Verification Results

### TypeScript
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` — **No errors**
- `pnpm exec tsc -b packages/supi-code-intelligence/__tests__/tsconfig.json` — **No errors**

### Tests
- `pnpm vitest run packages/supi-code-intelligence/` — **286 passed, 4 skipped, 0 failed** (34 test files)

### Biome
- Existing issues only (pre-existing `noExplicitAny` in tests, `useMaxParams`/`noExcessiveCognitiveComplexity` in source) — no new issues introduced

### Files removed: 26 source files
| Layer | Files | Status |
|-------|-------|--------|
| Dead analysis services | 9 | Deleted |
| Dead tool executors | 2 | Deleted |
| Dead use-case | 1 | Deleted |
| Forwarder directories | 14 | Deleted (planner/, refactor/, substrate/, families/, tool/common/) |
| Forwarder files | 2 | Deleted (resolve-target.ts, workspace/request-context.ts) |

### Real code moved
- `tool/families/tree-sitter/execute.ts` → `tree-sitter/execute.ts`
- `tool/families/tree-sitter/format.ts` → `tree-sitter/format.ts`

### Source files: 119 → 93 (22% reduction)
