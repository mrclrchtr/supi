## Why

The original version of this change targeted a dedicated extension-local settings overlay. Since then, SuPi gained a shared settings registry and a single `/supi-settings` command that hosts settings for multiple extensions. The Claude-MD settings UI has already converged on that shared model in code, so the change artifacts should describe the implementation that actually ships.

A shared settings surface keeps configuration discoverable, avoids one-off per-extension command UIs, and gives users a consistent place to adjust Claude-MD behavior such as subdirectory discovery, refresh interval, context threshold, and searched file names.

## What Changes

- Expose Claude-MD settings through the shared `/supi-settings` overlay instead of a dedicated extension-local settings command
- Register a Claude-MD settings section that shows the current scoped values for `subdirs`, `rereadInterval`, `contextThreshold`, and `fileNames`
- Use `SettingsList` value cycling for `subdirs` and `contextThreshold`
- Use text-input submenus for `rereadInterval` and `fileNames`
- Treat `rereadInterval` as a numeric turn interval where `0` disables refresh/re-read behavior
- Allow `fileNames` to be edited as a comma-separated list; clearing the value removes the scoped key and falls back to defaults
- Persist all confirmed changes immediately to project or global SuPi config via the shared settings registry
- Add tests for Claude-MD settings registration/persistence and shared `/supi-settings` command wiring

## Capabilities

### New Capabilities
- `claude-md-settings-ui`: Claude-MD configuration is available inside the shared SuPi settings UI with project/global scope support

### Modified Capabilities
- `claude-md-settings-ui`: the implementation uses the shared `/supi-settings` command and settings registry rather than an extension-local command and bespoke overlay module

## Impact

- `packages/supi-claude-md/index.ts` — registers the Claude-MD settings section during extension startup
- `packages/supi-claude-md/settings-registration.ts` — scope-aware Claude-MD setting items and persistence
- `packages/supi-core/settings-ui.ts` — shared settings overlay used by Claude-MD and other SuPi extensions
- `packages/supi-core/settings-command.ts` — shared `/supi-settings` command entry point
- `packages/supi-claude-md/__tests__/settings-registration.test.ts` — Claude-MD settings behavior coverage
- `packages/supi-core/__tests__/settings-command.test.ts` — `/supi-settings` command wiring coverage
- `packages/supi-claude-md/README.md` and `packages/supi-claude-md/resources/supi-claude-md-guide/SKILL.md` — updated user-facing documentation for the shared settings flow
