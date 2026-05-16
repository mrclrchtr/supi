# Archive

## Verification Results

### pack-staged.test.mjs (5 tests)
- Root cause: `cp -RL` fails on broken symlinks created by pnpm's hoisted linker (e.g., node_modules/.bin/vitest → ../vitest/vitest.mjs where target doesn't exist).
- Fix: `removeKnownBrokenSymlinks()` runs `find -L ... -exec rm {} \;` before `cp -RL` to delete broken symlinks.
- Result: All 5 tests pass ✓

### manager-concurrency-guard.test.ts (1 test)
- Root cause: `/tmp/package.json` exists on dev machine, causing `findProjectRoot` to resolve test paths to `/tmp` instead of expected test-specific directories.
- Fix: Tests now use `mkdtempSync()` with real temp directories and `package.json` markers.
- Result: All 5 tests pass ✓

### Full pnpm verify
- 147 test files, 1573 tests: all passed ✓
- Biome: clean ✓
- Typecheck: clean ✓
- Pack check + verify: all packages verified ✓
