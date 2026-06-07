# Task 4: Verify end-to-end: include works, Next-steps gone, no regressions

1. Test `code_context` with `include` and no `task` — verify sections render correctly
2. Test `code_context` with `task` — verify existing behavior unchanged, no `## Next`
3. Test all other tools — verify no `## Next` or `---` footer in any output
4. Run `pnpm vitest run packages/supi-code-intelligence/` — no regressions
5. Run `pnpm verify:ai` — typecheck + lint pass
