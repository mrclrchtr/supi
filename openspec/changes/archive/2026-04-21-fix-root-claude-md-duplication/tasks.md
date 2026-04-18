## 1. State and Logic Changes

- [ ] 1.1 Change `createInitialState()` in `state.ts` to set `needsRefresh: false` instead of `true`
- [ ] 1.2 Remove `state.needsRefresh = reconstructed.completedTurns === 0` from `session_start` handler in `index.ts`

## 2. Test Updates

- [ ] 2.1 Update `refresh.test.ts` — fix `returns true when needsRefresh flag is set` test to use explicit setup (set `needsRefresh: true` manually) rather than relying on default initial state
- [ ] 2.2 Update `extension-lifecycle.test.ts` — change initial state expectation from `needsRefresh: true` to `needsRefresh: false`
- [ ] 2.3 Update `extension-toolresult.test.ts` — change initial state expectation from `needsRefresh: true` to `needsRefresh: false`
- [ ] 2.4 Update `extension-refresh.test.ts` — verify turn-0 `before_agent_start` no longer emits a refresh message; add test for first periodic refresh at turn `rereadInterval`
- [ ] 2.5 Add new test: fresh session does not emit `supi-claude-md-refresh` on first `before_agent_start`
- [ ] 2.6 Add new test: compaction still sets `needsRefresh = true` and triggers re-injection

## 3. Verification

- [ ] 3.1 Run `pnpm vitest run packages/supi-claude-md/` — all tests pass
- [ ] 3.2 Run `pnpm biome:ai` — no lint/format issues
- [ ] 3.3 Run `pnpm typecheck` — no type errors
