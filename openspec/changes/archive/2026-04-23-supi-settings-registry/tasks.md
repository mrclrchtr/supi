## 1. supi-core: Settings Registry

- [x] 1.1 Create `packages/supi-core/settings-registry.ts` with `SettingsSection` type, `SettingsItem` type (compatible with pi-tui `SettingItem`), `registerSettings()`, and `getRegisteredSettings()`
- [x] 1.2 Add unit tests for `registerSettings()` (register, retrieve, duplicate id replacement, empty registry)
- [x] 1.3 Export new types and functions from `packages/supi-core/index.ts`

## 2. supi-core: Settings UI

- [x] 2.1 Create `packages/supi-core/settings-ui.ts` with `openSettingsOverlay(ctx)` using pi-tui `SettingsList` + `getSettingsListTheme()` from `@mariozechner/pi-coding-agent`, scope toggle (Tab) that rebuilds items array on scope change, extension-grouped items, and search
- [x] 2.2 Create `packages/supi-core/settings-command.ts` with `registerSettingsCommand(pi)` that registers `/supi-settings` calling `openSettingsOverlay`
- [x] 2.3 Export `registerSettingsCommand` and `openSettingsOverlay` from `packages/supi-core/index.ts`
- [x] 2.4 Add `@mariozechner/pi-tui` as peerDependency in `packages/supi-core/package.json`
- [x] 2.5 Add unit tests for pure helpers in settings-ui (scope label formatting, items array building from registry) — skip TUI component-level tests

## 3. supi: Settings command wrapper

- [x] 3.1 Create `packages/supi/settings.ts` — thin extension wrapper that imports `registerSettingsCommand` from supi-core and calls it
- [x] 3.2 Add `"./settings.ts"` to `packages/supi/package.json` pi.extensions array

## 4. supi-lsp: Migrate Settings to Registry

- [x] 4.1 Add `LspSettings` interface and `loadLspSettings(cwd)` to a new `packages/supi-lsp/settings-registration.ts` — reads `enabled`, `severity`, `servers` from supi shared config `"lsp"` section with defaults `{ enabled: true, severity: 1, servers: [] }`
- [x] 4.2 Add `registerLspSettings(cwd)` to `packages/supi-lsp/settings-registration.ts` that calls supi-core's `registerSettings()` with LSP items: enabled toggle (`values: ["on", "off"]`), severity cycling (`values: ["1 (errors)", "2 (warnings)", "3 (info)", "4 (hints)"]`), active servers submenu
- [x] 4.3 Implement server allowlist submenu in `packages/supi-lsp/settings-registration.ts`: read merged server list from `loadConfig()`, render as `SettingsList` with enabled/disabled toggles, persist as `servers` string array via supi shared config
- [x] 4.4 Implement `loadValues` and `persistChange` callbacks with string↔typed conversion (e.g., `"on"`→`true`, `"1 (errors)"`→`1`, `["ts-ls", "pyright"]`→display string)
- [x] 4.5 Update `packages/supi-lsp/lsp.ts` — call `registerLspSettings(ctx.cwd)` in factory, call `loadLspSettings()` in `session_start`, apply allowlist filter to `loadConfig()` result in `session_start` (not inside `loadConfig()`), remove `registerDisabledStatusCommand()`, handle `enabled: false` by skipping tool/lifecycle registration
- [x] 4.6 Remove `getServerAllowList()` and `PI_LSP_SERVERS` env var read from `packages/supi-lsp/config.ts`
- [x] 4.7 Remove `parseSeverity()` and `PI_LSP_SEVERITY` env var read from `packages/supi-lsp/lsp.ts`
- [x] 4.8 Remove `PI_LSP_DISABLED` env var check from `packages/supi-lsp/lsp.ts`
- [x] 4.9 Update `packages/supi-lsp/CLAUDE.md` — remove env var documentation, document supi shared config and registry participation
- [x] 4.10 Add/update tests for new settings loading path (supi config instead of env vars), test `loadLspSettings`, test `registerLspSettings` items array

## 5. supi-claude-md: Migrate Settings to Registry

- [x] 5.1 Create `packages/supi-claude-md/settings-registration.ts` with `registerClaudeMdSettings(cwd)` that calls supi-core's `registerSettings()` with claude-md items: subdirs toggle, rereadInterval submenu, fileNames submenu
- [x] 5.2 Implement rereadInterval submenu: custom `Component` wrapping pi-tui `Input` for number/"off"/"default" editing (not a nested SettingsList — uses Input for freeform text)
- [x] 5.3 Implement fileNames submenu: custom `Component` wrapping pi-tui `Input` for comma-separated file name editing
- [x] 5.4 Implement `loadValues` and `persistChange` callbacks with string↔typed conversion (e.g., `3`→`"3"`, `true`→`"on"`, `["CLAUDE.md","AGENTS.md"]`→`"CLAUDE.md, AGENTS.md"`)
- [x] 5.5 Call `registerClaudeMdSettings()` in `packages/supi-claude-md/index.ts` factory function
- [x] 5.6 Remove `/supi-claude-md` command registration from `packages/supi-claude-md/index.ts`
- [x] 5.7 Delete `packages/supi-claude-md/settings.ts`
- [x] 5.8 Delete `packages/supi-claude-md/commands.ts`
- [x] 5.9 Delete `packages/supi-claude-md/__tests__/settings.test.ts`
- [x] 5.10 Update `packages/supi-claude-md/CLAUDE.md` — remove settings.ts and commands.ts references, document registry participation

## 6. Cleanup & Verification

- [x] 6.1 Run `pnpm install` to refresh lockfile after peerDependency changes
- [x] 6.2 Run `pnpm typecheck` and fix any type errors
- [x] 6.3 Run `pnpm test` and ensure all tests pass (pre-existing failures in guidance/integration tests only)
- [x] 6.4 Run `pnpm biome:fix && pnpm biome:ai` and fix lint issues
- [x] 6.5 Update root `CLAUDE.md` to document the settings registry pattern (how to participate, `registerSettings` API, `/supi-settings` command)
