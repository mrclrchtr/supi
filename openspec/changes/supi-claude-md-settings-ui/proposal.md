## Why

The `supi-claude-md` extension currently requires users to type command-line style instructions (`/supi-claude-md interval 5`, `/supi-claude-md subdirs on`, etc.) to change settings. This is error-prone, hard to discover, and provides no visual feedback for current values. A structured settings UI — similar to the `ask_user` tool overlay — will make configuration intuitive, reduce mistakes, and show effective values at a glance.

## What Changes

- Add an interactive **settings overlay** for `supi-claude-md`, triggered via `/supi-claude-md settings`
- The overlay displays current config values (rereadInterval, subdirs, fileNames) and allows inline editing
- Boolean toggles use `SettingsList` cycling (on/off)
- Numeric `rereadInterval` uses a dedicated numeric input field (number, "off", or "default")
- `fileNames` displayed as editable comma-separated list
- Scope selector (Project vs Global) determines where changes are persisted
- Changes are applied immediately to the `supi-core` config system (`writeSupiConfig` / `removeSupiConfigKey`)
- Existing subcommands (`interval`, `subdirs`, `compact`) remain functional but are no longer the primary settings interface
- New `settings.ts` module containing the UI component, extracted from `commands.ts`
- Tests for the settings component and command wiring

## Capabilities

### New Capabilities
- `claude-md-settings-ui`: Interactive terminal UI for viewing and editing `supi-claude-md` configuration with project/global scope support

### Modified Capabilities
- (none — this is a pure UI addition; config persistence and command handling behavior stays the same)

## Impact

- `packages/supi-claude-md/commands.ts` — adds `settings` subcommand routing
- `packages/supi-claude-md/settings.ts` — new file: overlay component, scope management, input handlers
- `packages/supi-claude-md/index.ts` — no changes required (command handler delegates to `commands.ts`)
- `packages/supi-claude-md/__tests__/settings.test.ts` — new tests for UI component logic
- `@mariozechner/pi-tui` — peer dependency already present via `@mrclrchtr/supi-ask-user`
