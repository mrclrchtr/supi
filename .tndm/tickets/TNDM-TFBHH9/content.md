# Vitest Performance Optimization — Implementation Plan

Profile-driven optimization in 6 tasks: benchmark baseline, profile imports, apply root config (threads + cache + optimizer scaffold), split workspace projects, tune optimizer from profile data, annotate concurrent tests, and verify end-to-end.

## File map

| File | Change |
|---|---|
| `vitest.config.ts` | Add `pool: 'threads'`, `isolate: false`, `testTimeout: 2000`, `hookTimeout: 5000`, `experimental.fsModuleCache`, `deps.optimizer.ssr` scaffold |
| `vitest.workspace.ts` | Convert string array to inline project configs: supi-tree-sitter gets `pool: 'forks'` + `isolate: true`; supi-lsp gets `isolate: true` + `testTimeout: 10000` |
| `packages/*/__tests__/**/*.test.ts` | Add `test.concurrent` where safe (no shared mutable state, no `vi.useFakeTimers`, no order dependency) |

## Configuration target

Root `vitest.config.ts` (merging with existing `exclude` + `onUnhandledError`):

```ts
test: {
  pool: 'threads',
  isolate: false,
  testTimeout: 2000,
  hookTimeout: 5000,
  experimental: {
    fsModuleCache: true,
  },
  deps: {
    optimizer: {
      ssr: {
        enabled: true,
        include: [], // populated in task 4 from profiling data
      },
    },
  },
}
```

Workspace: 12 packages as strings (inherit root), 2 as inline objects (tree-sitter, lsp).

## Concurrent test criteria

Only where all are true:
- Same `describe` block
- No shared mutable state between tests
- No `vi.useFakeTimers()` (timers are global)
- No serial execution dependency (setup/teardown per-test is fine)

## Verification

- `pnpm test` passes 3 consecutive times with identical results
- `time pnpm test` shows measurable improvement
- `pnpm exec biome check` and `pnpm typecheck` clean
