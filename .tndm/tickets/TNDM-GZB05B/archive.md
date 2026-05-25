# Archive

## Verification Pipeline (run 2026-05-24T02:05:54Z)

### 1. Tree-sitter WASM checks — PASS
```
Kotlin Tree-sitter WASM is current (0.3.8)
SQL Tree-sitter WASM is current (0.3.11)
```

### 2. TypeScript typecheck — PASS
```
tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json
TypeScript: No errors found
```

### 3. Biome CI lint — PASS (1 pre-existing warning unrelated)
```
::warning title=suppressions/unused,file=packages/supi-lsp/src/tool/register-tools.ts
```

### 4. Vitest — PASS
- 167 test files passed (0 failed)
- 1654 tests passed (0 failed)
- Duration: 12.52s (was 34s baseline, **63% improvement**)
- Import phase: 29.81s (was 70s baseline, **57% improvement**)

### 5. Pack verification — PASS
All 16 packages verified successfully via `pack-all.mjs`

### 6. Full pipeline wall time — 25.87s (was ~54s baseline, **52% improvement**)

## File changes
- **8 new domain barrel files**: config.ts, context.ts, path.ts, project.ts, session.ts, settings.ts, settings-ui.ts, types.ts
- **3 modified infrastructure**: api.ts, index.ts, package.json (exports)
- **45 import site migrations** across 14 packages
- **5 test mock updates** (supi-core, supi-context, supi-debug, supi-rtk)
- **2 test infrastructure updates** (pack-staged.test.mjs)
- **1 doc update** (CLAUDE.md — added supi-core entry points section)
- **52 total files changed** (+171 / -267 lines)

## Performance improvement
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| pnpm verify | ~54s | 25.9s | -52% |
| pnpm test (vitest) | ~34s | 12.5s | -63% |
| Test import phase | ~70s | 29.8s | -57% |
| Slowest single import | 1.71s | 886ms | -48% |
