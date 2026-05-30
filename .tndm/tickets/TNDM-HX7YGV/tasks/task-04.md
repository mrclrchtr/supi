# Task 4: GREEN: implement diff-aware code_impact behavior and update public docs

## Goal

Pass the second RED suite by adding evidence-backed diff-aware impact analysis and updating the user-facing docs/guidance to prefer `code_impact`.

## Files

- `packages/supi-code-intelligence/src/tool/execute-impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts`
- `packages/supi-code-intelligence/src/git-context.ts`
- `packages/supi-code-intelligence/src/types.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `docs/tool-architecture.md`

## Change to make

1. Implement a diff-aware `code_impact` path in `packages/supi-code-intelligence/src/use-case/generate-impact.ts` for `changedFiles` and optional `baseRef`, using real workspace/git evidence only.
2. Honor `includeTests` in the impact result so likely-test output is explicit and deterministic instead of implicitly always-on.
3. Return an explicit unavailable/insufficient-evidence result for `change`-only requests that lack a resolvable target or diff inputs.
4. Keep `packages/supi-code-intelligence/src/use-case/generate-affected.ts` and `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` as compatibility layers that reuse the shared implementation instead of drifting into a forked code path.
5. Update markdown/hint text in `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`, `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`, and `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` so new workflow guidance prefers `code_impact`.
6. Update `packages/supi-code-intelligence/README.md`, `packages/supi-code-intelligence/CLAUDE.md`, and `docs/tool-architecture.md` so the docs describe `code_impact` as active/preferred and explain `code_affected` as a temporary compatibility alias.

## Verification

Run the focused RED suite from Task 3, then confirm the docs mention the preferred tool:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
rg -n 'code_impact|code_affected' packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md docs/tool-architecture.md
```

Expected result: the focused tests pass, and the grep output shows `code_impact` documented as active/preferred with `code_affected` described as compatibility-only where relevant.

## TDD status

Test-driven. Implement only after Task 3 fails for the right reason.
