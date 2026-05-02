## Why

Config-backed sections in `/supi-settings` currently rely on each extension remembering that `loadValues(scope, cwd)` must read raw values from the selected scope, not merged runtime config. That rule is easy to forget, and when an extension gets it wrong the global/project scope toggle shows misleading values even though the UI appears to work.

## What Changes

- Add a config-aware helper in `supi-core` for config-backed settings sections.
- Keep `registerSettings()` as the generic low-level registry API.
- Make the new helper load display values from the selected scope only (`defaults <- selected scope`) while leaving merged runtime config loading unchanged.
- Provide scoped persistence helpers so config-backed sections do not have to wire `writeSupiConfig()` / `removeSupiConfigKey()` by hand.
- Migrate `supi-claude-md` and `supi-lsp` to the new helper.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `settings-registry`: Add a config-backed registration helper that automatically uses raw selected-scope config for settings UI values and scoped persistence helpers for writes.

## Impact

- **supi-core**: add a new config-backed settings helper and export it from `index.ts`.
- **supi-claude-md**: migrate settings registration to the helper and remove duplicated scope-loading boilerplate.
- **supi-lsp**: migrate settings registration to the helper and remove duplicated scope-loading boilerplate.
- **Tests**: add helper coverage in `supi-core` and update settings registration tests in migrated packages.
