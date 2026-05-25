# Task 4: Convert vitest.workspace.ts to inline project configs with per-package overrides

## Goal
Replace the simple string array in `vitest.workspace.ts` with a mixed array: string entries for pure-TS packages (inherit root config), inline objects for supi-tree-sitter (forks) and supi-lsp (isolate).

## File
`vitest.workspace.ts`

## Changes
```ts
export default [
  // Pure-TS packages — inherit root config (threads, no isolation)
  "packages/supi-ask-user",
  "packages/supi-bash-timeout",
  "packages/supi-cache",
  "packages/supi-claude-md",
  "packages/supi-code-intelligence",
  "packages/supi-context",
  "packages/supi-core",
  "packages/supi-debug",
  "packages/supi-extras",
  "packages/supi-insights",
  "packages/supi-review",
  "packages/supi-rtk",
  "packages/supi-web",

  // supi-tree-sitter: forks for WASM safety, isolate to prevent cross-file WASM state bleed
  {
    name: "supi-tree-sitter",
    root: "packages/supi-tree-sitter",
    test: { pool: "forks", isolate: true },
  },

  // supi-lsp: isolate for real process spawning in integration tests
  {
    name: "supi-lsp",
    root: "packages/supi-lsp",
    test: { pool: "threads", isolate: true, testTimeout: 10000 },
  },
];
```

Note: supi-lsp keeps `pool: 'threads'` (not WASM), but needs `isolate: true` because its integration tests spawn real LSP processes. It also gets a longer `testTimeout` (10s) for slow process startup.

## Verification
- `pnpm exec biome check vitest.workspace.ts` passes.
- `pnpm test` passes — all 14 workspace projects run.
- Run specifically: `pnpm vitest run --project supi-tree-sitter` and `pnpm vitest run --project supi-lsp` to confirm the project names are recognized.

## Test-exempt
Config-only change — verified by running the suite.
