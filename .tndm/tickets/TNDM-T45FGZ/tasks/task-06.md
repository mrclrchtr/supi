# Task 6: Verification — performance measurement and full pipeline pass

Run the full verification pipeline and measure performance.

### Steps
1. **Clean**: delete any stale build artifacts from the workspace
  ```bash
  rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo packages/*/__tests__/tsconfig.tsbuildinfo
  ```

2. **First run** (cold, no cache):
  ```bash
  time pnpm typecheck
  ```
  Expected: ~8–12s, exits 0

3. **Second run** (incremental, `.tsbuildinfo` cached):
  ```bash
  time pnpm typecheck
  ```
  Expected: ~2–4s, exits 0

4. **Clean build** (`--force`, like CI):
  ```bash
  time pnpm exec tsc -b --force packages/*/tsconfig.json packages/*/__tests__/tsconfig.json
  ```
  Expected: ~8–12s, exits 0

5. **Full verify**:
  ```bash
  time pnpm verify
  ```
  Must pass — typecheck phase uses the new command, 3 pre-existing test failures remain unchanged.

6. **Check no emitted artifacts leak**:
  ```bash
  git status --porcelain
  ```
  Only `.gitignore` and package/tsconfig changes show. No `dist/` or `.tsbuildinfo` files in git.

### Baseline comparison

| Phase | Before | After |
|---|---|---|
| typecheck (cold) | 57s | 8-12s |
| typecheck (warm) | 57s | 2-4s |
| pnpm verify total | 54s | TBD (~35s?) |

Record actual timings in the verification output.
