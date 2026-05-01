## 1. Root install surface

- [ ] 1.1 Add `"./packages/supi/settings.ts"` to root `package.json` pi.extensions array

## 2. supi-core: Fix id collision

- [ ] 2.1 Update `packages/supi-core/settings-ui.ts` — prefix item ids with section id in `buildFlatItems` (`${section.id}.${item.id}`)
- [ ] 2.2 Update `findSectionAndId` to split prefixed id on first `.` to recover section and item id
- [ ] 2.3 Add test for cross-extension id collision (two sections with same item id)

## 3. supi-lsp: Dynamic settings reading

- [ ] 3.1 Restructure `packages/supi-lsp/lsp.ts` — remove early `return` when disabled; always register all handlers
- [ ] 3.2 Move `enabled`/`severity` checks into `session_start`: read fresh settings, skip init if disabled, recreate state with current severity
- [ ] 3.3 Remove `_initialSettings` parameter from `registerSessionLifecycleHandlers` (no longer needed)
- [ ] 3.4 Update tests for new behavior (disabled extension still registers handlers; enabling takes effect on reload)

## 4. supi-lsp: Server submenu dirty tracking

- [ ] 4.1 Add `dirty` flag to server submenu in `packages/supi-lsp/settings-registration.ts`
- [ ] 4.2 Set `dirty = true` only when a toggle actually changes
- [ ] 4.3 Return `undefined` from `done()` on Escape if not dirty
- [ ] 4.4 Add test for inspect-without-change behavior

## 5. Cleanup & Verification

- [ ] 5.1 Run `pnpm typecheck` and fix any type errors
- [ ] 5.2 Run `pnpm test` and ensure all tests pass
- [ ] 5.3 Run `pnpm biome:fix && pnpm biome:ai` and fix lint issues
