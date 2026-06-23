# Task 1: Create scripts/pack-all.mjs — parallel pack runner

## Goal

Write `scripts/pack-all.mjs` that spawns `node scripts/publish.mjs <pkg>` for all `packages/supi-*` packages in parallel with concurrency control.

## Requirements

- Discover all `packages/supi-*` directories containing `package.json`
- Spawn `node scripts/publish.mjs <pkg>` via `child_process.spawn` with `stdio: 'pipe'`
- Concurrency limit = `os.availableParallelism()` (or `os.cpus().length`)
- Collect stdout/stderr per package into buffers
- When each child exits: print `✓ <pkg>` (exit 0) or `✗ <pkg> (exit <code>)` with captured stderr
- Print summary at end: `N/N packages passed` or `X/N packages failed`
- Exit non-zero if any package failed
- Use workspace-relative paths (resolve `scripts/` from `import.meta` dirname)

## Verification

```bash
# From workspace root
node scripts/pack-all.mjs
# Expect: 16 packages discovered, parallel execution, ✓ per package, exit 0
```
