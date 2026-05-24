# Consolidate and parallelize pack verification

## Problem

`pnpm verify` has two pack-related steps that run serially and overlap heavily:

- `pack:check` — stages every package, rewrites manifests, runs `npm pack --dry-run` (30.2s, all 16 packages)
- `pack:verify` — stages bundled packages, packs, verifies tarball structure (23.2s, 11 bundled packages)

Both call the same staging logic (`pack-staged.mjs`: cp -RL → resolve bundled deps → rewrite manifests). 5 non-bundled packages are staged only for `pack:check`; 11 bundled packages are staged twice.

Total pack phase: **53s**.

## Solution

1. **Consolidate**: Extend `pack:verify` to all 16 packages. `pack:verify` is a strict superset of `pack:check` — the real tarball verification catches everything the dry-run catches plus `../` paths and `workspace:` protocol issues. Remove `pack:check` from the `verify` pipeline.

2. **Parallelize**: Write `scripts/pack-all.mjs` (~50 lines) that discovers `packages/supi-*`, spawns `node scripts/publish.mjs <pkg>` for each with concurrency = CPU count, collects per-package output, and reports pass/fail grouped. Replaces the serial `for` loop.

## Impact

- Pack phase: **53s → 6-8s** (85%+ reduction)
- Total verify: **~54s → ~45-52s** (test phase now dominates)
- No new dependencies, no changes to biome/vitest/tests
- `pack:check` stays as a standalone convenience command

## Files

| File | Action |
|------|--------|
| `scripts/pack-all.mjs` | **New** — parallel pack runner |
| `package.json` | **Edit** — update `pack:verify` and `verify` scripts |
| `CLAUDE.md` | **Edit** — update pack:verify description |
