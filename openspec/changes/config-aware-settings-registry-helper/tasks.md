## 1. supi-core helper

- [x] 1.1 Add a config-backed settings helper module in `packages/supi-core/` that wraps `registerSettings()`
- [x] 1.2 Implement selected-scope loading (`defaults <- selected scope`) and scoped `set` / `unset` persistence helpers
- [x] 1.3 Export the helper from `packages/supi-core/index.ts`

## 2. Migrate config-backed sections

- [x] 2.1 Migrate `packages/supi-claude-md/settings-registration.ts` to the new helper without changing runtime config loading semantics
- [x] 2.2 Migrate `packages/supi-lsp/settings-registration.ts` to the new helper without changing runtime config loading semantics
- [x] 2.3 Remove now-redundant per-section scope-loading boilerplate from migrated registrations

## 3. Tests and verification

- [x] 3.1 Add `supi-core` tests covering selected-scope loading and scoped persistence behavior for the helper
- [x] 3.2 Update `supi-claude-md` and `supi-lsp` settings registration tests to validate helper-backed project/global scope behavior
- [x] 3.3 Run targeted verification (`pnpm vitest run packages/supi-core/ packages/supi-lsp/ packages/supi-claude-md/`, `pnpm exec biome check packages/supi-core packages/supi-lsp packages/supi-claude-md`, and package typechecks)
