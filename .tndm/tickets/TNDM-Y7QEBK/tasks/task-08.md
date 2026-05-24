# Task 8: Full workspace verification

Run full workspace verification:

```bash
pnpm verify
```

This runs biome, tsc (source + tests), and the full test suite.

Expected: all checks pass. No regressions — this is a pure refactor with zero behavioral changes.

Also run the supi-lsp integration tests specifically to confirm no LSP behavior changes:

```bash
pnpm exec vitest run packages/supi-lsp/
```

Note: `supi-debug/src/status-log.ts` does NOT need updating — the tool count (10 LSP tools) is unchanged by this refactor.
