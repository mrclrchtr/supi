## 1. Delete fallback source and tests

- [x] 1.1 Delete `packages/supi-ask-user/ui-fallback.ts`
- [x] 1.2 Delete `packages/supi-ask-user/__tests__/fallback.test.ts`
- [x] 1.3 Delete `packages/supi-ask-user/__tests__/fallback-comments.test.ts`
- [x] 1.4 Delete `packages/supi-ask-user/__tests__/fallback-review.test.ts`

## 2. Refactor `ask-user.ts`

- [x] 2.1 Remove `FallbackUi` and `runFallbackQuestionnaire` imports from `./ui-fallback.ts`
- [x] 2.2 Remove `runFallbackQuestionnaire` re-export
- [x] 2.3 Simplify `ExtensionUi` interface: drop `select`/`input`, keep only `custom`
- [x] 2.4 Rewrite `driveQuestionnaire` to use only the rich path; return an explicit error result when `custom` is unavailable

## 3. Rewrite `execute.test.ts`

- [x] 3.1 Replace `fallbackCtx` helper with `richCtx` that mocks `custom()` returning a promise
- [x] 3.2 Update all existing tests to use `richCtx`
- [x] 3.3 Remove the `can return a discuss answer through the fallback path` test
- [x] 3.4 Add a test that verifies an explicit error is returned when `custom` is unavailable

## 4. Clean up comments and references

- [x] 4.1 Update `flow.ts` header comment to no longer mention "overlay and fallback"
- [x] 4.2 Update `format.ts` header comment to no longer mention "both UI paths"
- [x] 4.3 Update `ask-user.ts` module comments to remove `ui-fallback.ts` reference

## 5. Update spec

- [x] 5.1 Apply the delta in `openspec/changes/remove-ask-user-fallback/specs/ask-user/spec.md` to `openspec/specs/ask-user/spec.md`

## 6. Verify

- [x] 6.1 Run `pnpm exec biome check --write packages/supi-ask-user`
- [x] 6.2 Run `pnpm vitest run packages/supi-ask-user/`
- [x] 6.3 Run `pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json`
- [x] 6.4 Run `chezmoi status|diff|apply -n` if any dotfile changes were made (unlikely)
