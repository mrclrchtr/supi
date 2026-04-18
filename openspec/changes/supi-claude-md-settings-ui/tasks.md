## 1. Scaffold and Types

- [ ] 1.1 Create `packages/supi-claude-md/settings.ts` with overlay component types and state interface
- [ ] 1.2 Define `SettingsScope`, `SettingsRow`, and `SettingsOverlayState` types in `settings.ts`
- [ ] 1.3 Export `openSettingsOverlay(ctx)` entry point from `settings.ts`

## 2. Pure Helpers and Config Integration

- [ ] 2.1 Implement `loadSettingsForScope(scope, ctx)` to read project or global config via `loadSupiConfig`
- [ ] 2.2 Implement `persistSetting(scope, ctx, key, value)` using `writeSupiConfig` and `removeSupiConfigKey`
- [ ] 2.3 Implement `buildSettingsRows(config)` to generate `SettingItem[]` for `SettingsList` plus custom interval row

## 3. TUI Overlay Component

- [ ] 3.1 Build overlay container with scope toggle header (Project / Global) using `Text` and theme tokens
- [ ] 3.2 Integrate `SettingsList` for `subdirs` and `compactRefresh` booleans with `getSettingsListTheme()`
- [ ] 3.3 Add custom interval row with `Input` component; handle numeric entry, "off" (0), and reset-to-default
- [ ] 3.4 Add read-only `fileNames` display row beneath the editable rows
- [ ] 3.5 Implement keyboard handling: ↑↓ navigate, Enter confirm/edit, Escape close, Tab switch scope
- [ ] 3.6 Add footer hint line showing available keys (`↑↓ navigate • enter edit/toggle • tab scope • esc close`)
- [ ] 3.7 Ensure `invalidate()` and `render(width)` caching follow the component contract

## 4. Command Wiring

- [ ] 4.1 Add `settings` case to `handleCommand` in `commands.ts` calling `openSettingsOverlay(ctx)`
- [ ] 4.2 Add `settings` to `SUBCOMMANDS` array and `getSubcommandHelp`
- [ ] 4.3 Verify `getArgumentCompletions` includes `settings`

## 5. Testing

- [ ] 5.1 Create `packages/supi-claude-md/__tests__/settings.test.ts` with unit tests for `loadSettingsForScope`, `persistSetting`, and `buildSettingsRows`
- [ ] 5.2 Test scope switching reloads correct config values
- [ ] 5.3 Test interval persistence: number, 0 (off), and default (key removal)
- [ ] 5.4 Test boolean toggle persistence writes correct true/false values
- [ ] 5.5 Run `pnpm vitest run packages/supi-claude-md/` and ensure all tests pass
- [ ] 5.6 Run `pnpm exec biome check --write packages/supi-claude-md/` to auto-fix formatting

## 6. Verification and Documentation

- [ ] 6.1 Run `pnpm typecheck` to confirm no TypeScript errors
- [ ] 6.2 Run `chezmoi doctor` or local lint scripts if applicable
- [ ] 6.3 Update `packages/supi-claude-md/CLAUDE.md` to mention the new `/supi-claude-md settings` command
- [ ] 6.4 Run `openspec verify-change supi-claude-md-settings-ui` to validate implementation against artifacts
