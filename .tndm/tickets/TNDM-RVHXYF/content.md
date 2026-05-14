## Approved Design

**Problem:** 32 CI test failures, all environmental.

**Root cause 1:** `rg` (ripgrep) is not installed on the ubuntu-24.04 runner image. `execFileSync("rg", ...)` throws ENOENT, which `handleRipgrepError()` silently treats as empty matches. Affects 28 tests (pattern search, heuristic fallback, confidence metadata).

**Root cause 2:** Git 2.53.0 uses `master` as default branch. Tests expect `main`. Affects 4 tests.

### Fixes

**1a)** Install `rg` in CI workflow — add `sudo apt-get install -y ripgrep` before `pnpm verify`.

**1b)** Improve `handleRipgrepError()` in `search-helpers.ts` — detect ENOENT and return a clear error message instead of silently empty results.

**2)** Fix git tests — add `git branch -m main` after `git init` in:
- `packages/supi-review/__tests__/git.test.ts` (`makeTempRepo`)
- `packages/supi-code-intelligence/__tests__/git-context.test.ts` (`initGit`)

### Files to change
- `.github/workflows/ci.yml`
- `packages/supi-code-intelligence/src/search-helpers.ts`
- `packages/supi-review/__tests__/git.test.ts`
- `packages/supi-code-intelligence/__tests__/git-context.test.ts`

### Verification
- `pnpm vitest run packages/supi-code-intelligence/ packages/supi-review/` — all pass
- `pnpm exec tsc --noEmit` — no type errors