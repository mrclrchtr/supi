## 1. Shared settings integration

- [x] 1.1 Register Claude-MD settings during extension startup via `registerClaudeMdSettings()` in `packages/supi-claude-md/index.ts`
- [x] 1.2 Expose Claude-MD configuration through the shared `/supi-settings` command implemented in `packages/supi-core/settings-command.ts`
- [x] 1.3 Reuse the shared overlay in `packages/supi-core/settings-ui.ts` for Claude-MD settings rendering, scope switching, and immediate refresh

## 2. Claude-MD settings section

- [x] 2.1 Implement scope-aware loading in `packages/supi-claude-md/settings-registration.ts` with `loadSupiConfigForScope()`
- [x] 2.2 Implement scoped persistence with `writeSupiConfig()` and `removeSupiConfigKey()`
- [x] 2.3 Register `subdirs`, `rereadInterval`, `contextThreshold`, and `fileNames` as Claude-MD `SettingItem`s
- [x] 2.4 Use value cycling for `subdirs` and `contextThreshold`
- [x] 2.5 Use submenu text inputs for `rereadInterval` and `fileNames`
- [x] 2.6 Persist `fileNames` as a comma-separated list and fall back to defaults when the input is cleared

## 3. Documentation and artifact alignment

- [x] 3.1 Update the change proposal to describe the shared `/supi-settings` architecture
- [x] 3.2 Update the design artifact to reflect `settings-registration.ts`, shared overlay usage, and current `rereadInterval` / `fileNames` behavior
- [x] 3.3 Update the delta spec to describe shared-command entry, editable `fileNames`, and current `rereadInterval` semantics
- [x] 3.4 Update `packages/supi-claude-md/README.md`, `packages/supi-claude-md/resources/supi-claude-md-guide/SKILL.md`, and `packages/supi-claude-md/CLAUDE.md` to match the shipped settings UX

## 4. Test coverage

- [x] 4.1 Expand `packages/supi-claude-md/__tests__/settings-registration.test.ts` to cover default values and scope-aware loading
- [x] 4.2 Add persistence coverage for `subdirs`, `rereadInterval`, `contextThreshold`, and `fileNames`
- [x] 4.3 Add shared settings overlay tests in `packages/supi-core/__tests__/settings-ui.test.ts` for empty-state notification and scope switching
- [x] 4.4 Add `/supi-settings` command wiring coverage in `packages/supi-core/__tests__/settings-command.test.ts`
- [x] 4.5 Remove stale Claude-MD test references to the old `commands.ts` shape
- [x] 4.6 Run `pnpm vitest run packages/supi-claude-md/ packages/supi-core/`
- [x] 4.7 Run `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json`

## 5. Verification

- [x] 5.1 Re-verify that the change artifacts match the current shared-settings implementation state
