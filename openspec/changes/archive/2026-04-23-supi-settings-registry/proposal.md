## Why

LSP settings are configured via environment variables (`PI_LSP_DISABLED`, `PI_LSP_SEVERITY`, `PI_LSP_SERVERS`) with no UI and no persistence. Claude-MD has a full settings UI but it's 400+ lines of hand-built TUI code specific to that one extension. Each new extension that needs settings would have to duplicate this effort. A shared settings registry in supi-core with a generic UI using pi-tui's built-in `SettingsList` component eliminates duplication, unifies the UX, and makes settings persistent and discoverable.

## What Changes

- **New**: Settings registry in supi-core (`settings-registry.ts`) — module-level store where extensions declare their settings sections
- **New**: Generic settings UI in supi-core (`settings-ui.ts`) — renders all registered sections using pi-tui's `SettingsList` with scope toggle (project/global), search, and submenu support
- **New**: `/supi-settings` command — opens the unified settings overlay
- **Modified**: supi-lsp reads `enabled`, `severity`, and `servers` from supi shared config instead of env vars
- **Modified**: supi-lsp's server allowlist becomes a toggle submenu per detected server
- **Removed**: `PI_LSP_DISABLED`, `PI_LSP_SEVERITY`, `PI_LSP_SERVERS` env var reads from supi-lsp
- **Removed**: supi-claude-md's `settings.ts` (400+ lines of custom TUI rendering) — replaced by registry + generic UI
- **Removed**: supi-claude-md's `commands.ts` — `/supi-claude-md` command replaced by `/supi-settings`
- **Removed**: `/supi-claude-md` command registration

## Capabilities

### New Capabilities
- `settings-registry`: Shared module-level registry where supi extensions declare their settings sections (id, label, items, load/persist callbacks). Generic settings UI rendering all registered sections via pi-tui `SettingsList` with project/global scope toggle, search, and submenu support. Triggered by `/supi-settings` command.

### Modified Capabilities
- `lsp-config`: Replace environment variable controls (`PI_LSP_DISABLED`, `PI_LSP_SEVERITY`, `PI_LSP_SERVERS`) with supi shared config under `"lsp"` section. Server allowlist becomes a toggle submenu per detected server. Settings registered via supi-core settings registry.

## Impact

- **supi-core**: New files `settings-registry.ts` and `settings-ui.ts`. New peer dep on `@mariozechner/pi-tui`. Exports `registerSettings()` and `openSettingsOverlay()`.
- **supi-lsp**: Remove env var reads in `lsp.ts`. Add `registerSettings()` call. Remove `registerDisabledStatusCommand`. Config loading reads from supi shared config for `enabled`/`severity`/`servers`. `.pi-lsp.json` remains for server definitions only.
- **supi-claude-md**: Delete `settings.ts` and `commands.ts`. Add `registerSettings()` call in `index.ts`. Remove `/supi-claude-md` command registration.
- **Config files**: LSP settings migrate from env vars to `.pi/supi/config.json` (project) and `~/.pi/agent/supi/config.json` (global) under `"lsp"` section.
