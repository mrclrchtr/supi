# Task 3: Apply root vitest.config.ts changes — pool, isolate, cache, timeouts, optimizer scaffold

## Goal
Apply the core performance config to `vitest.config.ts`: switch to threads pool, disable per-file isolation, enable filesystem module cache, reduce timeouts, and scaffold `deps.optimizer`.

## File
`vitest.config.ts`

## Changes
Merge into the existing `test` block (which already has `exclude` and `onUnhandledError`):

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
        include: [], // populated in task 5
      },
    },
  },
  // keep existing
  exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**"],
  onUnhandledError(error) { ... },
}
```

## Verification
- `pnpm exec biome check vitest.config.ts` passes.
- `pnpm test` still passes (no behavioral change yet — include is empty).
- Run `pnpm test` twice to confirm `fsModuleCache` doesn't break anything on the second run (cache hit).

## Test-exempt
Config-only change — verified by running the suite.
