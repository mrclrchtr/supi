## File map

- `packages/supi-code-intelligence/__tests__/git-context.test.ts` — failing git-context tests that assume branch rename behavior.
- `packages/supi-code-intelligence/src/git-context.ts` — git-context implementation if root cause is there instead of the test.
- `packages/supi-review/__tests__/git.test.ts` — failing review git tests with the same branch-rename symptom.
- `packages/supi-review/src/git.ts` — review git helpers if the root cause is in implementation rather than tests.
- `packages/supi-lsp/__tests__/manager-concurrency-guard.test.ts` — failing LSP concurrency-guard regression.
- `packages/supi-lsp/src/manager/manager.ts` plus nearby `manager-*` helpers — LSP runtime code if the concurrency regression is real.
- `.tndm/tickets/TNDM-GFNN3W/` and `.tndm/tickets/TNDM-HX1Z0N/` — ticket artifacts affected by closeout/debug tracking.

- [x] **Task 1**: Reproduce and fix the git-based hook failures
  - File: `packages/supi-code-intelligence/__tests__/git-context.test.ts`
  - File: `packages/supi-review/__tests__/git.test.ts`
  - File: `packages/supi-code-intelligence/src/git-context.ts`
  - File: `packages/supi-review/src/git.ts`
  - Change: reproduce the git test failures exactly, identify whether the root cause is test setup or implementation assumptions, then make the smallest fix so these tests pass reliably on environments where `git init` already starts on `main`.
  - Verification (RED): `pnpm vitest run packages/supi-code-intelligence/__tests__/git-context.test.ts packages/supi-review/__tests__/git.test.ts`
  - Verification (GREEN): `pnpm vitest run packages/supi-code-intelligence/__tests__/git-context.test.ts packages/supi-review/__tests__/git.test.ts`

- [x] **Task 2**: Reproduce and fix the LSP concurrency-guard failure
  - File: `packages/supi-lsp/__tests__/manager-concurrency-guard.test.ts`
  - File: `packages/supi-lsp/src/manager/manager.ts`
  - File: `packages/supi-lsp/src/manager/manager-client-state.ts`
  - File: `packages/supi-lsp/src/manager/manager-helpers.ts`
  - Change: reproduce the failing concurrency-guard test, trace why an existing running client resolves to `null`, and make the smallest root-cause fix or expectation update needed to restore the intended behavior.
  - Verification (RED): `pnpm vitest run packages/supi-lsp/__tests__/manager-concurrency-guard.test.ts`
  - Verification (GREEN): `pnpm vitest run packages/supi-lsp/__tests__/manager-concurrency-guard.test.ts`

- [ ] **Task 3**: Re-run the hook-equivalent verification and create the commit
  - File: repository root staged changes
  - Change: run the repo test command that previously blocked the commit, confirm it passes fresh, then create a commit containing the code-intel work plus any hook-fix changes.
  - Verification: `HK_SKIP=* pnpm -s test`
  - Verification: `git commit -m "..."`

- [ ] **Task 4**: Rebase `supi-wt2` onto local `main` and re-verify
  - File: git branch state
  - Change: fetch the local `main` tip from the current clone, rebase `supi-wt2` onto it, resolve any conflicts carefully, then rerun targeted verification to ensure the rebased branch is healthy.
  - Verification: `git rev-parse --abbrev-ref HEAD && git rebase main`
  - Verification: `pnpm vitest run packages/supi-code-intelligence/ packages/supi-lsp/__tests__/manager-concurrency-guard.test.ts packages/supi-review/__tests__/git.test.ts && pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp`

## Constraints

- Do not bypass hooks.
- Fix root causes, not just local symptoms.
- Keep the scope limited to what is required for a clean commit and requested rebase.