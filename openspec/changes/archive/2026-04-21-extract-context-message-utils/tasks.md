## 1. Create shared module in supi-core

- [x] 1.1 Create `packages/supi-core/context-messages.ts` with `ContextMessageLike` type, `getContextToken`, `findLastUserMessageIndex`, and `pruneAndReorderContextMessages` functions
- [x] 1.2 Export the new module from `packages/supi-core/index.ts`
- [x] 1.3 Add unit tests in `packages/supi-core/__tests__/context-messages.test.ts` covering all scenarios from the spec

## 2. Migrate supi-claude-md

- [x] 2.1 Remove `pruneStaleRefreshMessages`, `getContextToken`, `findLastUserMessageIndex`, and `ContextMessageLike` from `packages/supi-claude-md/refresh.ts`
- [x] 2.2 Update `packages/supi-claude-md/index.ts` to import `pruneAndReorderContextMessages` from `supi-core` and call it with `customType: "supi-claude-md-refresh"`
- [x] 2.3 Update `packages/supi-claude-md/refresh.ts` to remove unused imports (`wrapExtensionContext` import stays for `formatRefreshContext`)
- [x] 2.4 Update all test mocks in `packages/supi-claude-md/__tests__/` that reference `pruneStaleRefreshMessages` to use `pruneAndReorderContextMessages` instead
- [x] 2.5 Remove the now-empty `pruneStaleRefreshMessages` tests from `packages/supi-claude-md/__tests__/refresh.test.ts` (coverage now in supi-core)

## 3. Migrate supi-lsp

- [x] 3.1 Remove `reorderDiagnosticContextMessages`, `getContextToken`, `findLastUserMessageIndex`, and `ContextMessageLike` from `packages/supi-lsp/guidance.ts`
- [x] 3.2 Update `packages/supi-lsp/lsp.ts` to import `pruneAndReorderContextMessages` from `supi-core` and call it with `customType: "lsp-context"`
- [x] 3.3 Update all test mocks in `packages/supi-lsp/__tests__/` that reference `reorderDiagnosticContextMessages` to use `pruneAndReorderContextMessages` instead
- [x] 3.4 Remove the now-empty `reorderDiagnosticContextMessages` tests from `packages/supi-lsp/__tests__/guidance.test.ts` (coverage now in supi-core)

## 4. Verify

- [x] 4.1 Run `pnpm biome:fix && pnpm biome:ai` — fix formatting and lint across all touched files
- [x] 4.2 Run `pnpm typecheck` — ensure no type errors
- [x] 4.3 Run `pnpm test` — ensure all tests pass
- [x] 4.4 Run `pnpm verify` — full verification suite
