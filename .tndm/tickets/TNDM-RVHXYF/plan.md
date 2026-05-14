# Plan: Fix CI test failures

- [x] **Task 1**: Improve ENOENT handling in `search-helpers.ts`
  - File: `packages/supi-code-intelligence/src/search-helpers.ts`
  - Change: Detect when `rg` is not found (ENOENT) in `handleRipgrepError()` and return a clear error message instead of silently empty matches. Check `err.code === 'ENOENT'` before the `isExecError` gate.
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

- [x] **Task 2**: Install `rg` in CI workflow
  - File: `.github/workflows/ci.yml`
  - Change: Add a step `Install ripgrep` (run: `sudo apt-get install -y ripgrep`) before the `Verify workspace and staged package tarballs` step.
  - Verification: CI run passes the verify job.

- [x] **Task 3**: Fix git tests to rename default branch to `main`
  - Files:
    - `packages/supi-review/__tests__/git.test.ts` — add `execSync("git branch -m main", { cwd: dir, stdio: "ignore" })` in `makeTempRepo()`
    - `packages/supi-code-intelligence/__tests__/git-context.test.ts` — add `execFileSync("git", ["branch", "-m", "main"], { cwd: dir })` in `initGit()`
  - Verification: `pnpm vitest run packages/supi-code-intelligence/__tests__/git-context.test.ts packages/supi-review/__tests__/git.test.ts` — all pass