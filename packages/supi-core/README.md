# @mrclrchtr/supi-core

Shared infrastructure for SuPi extensions.

This package is mainly for extension authors. It gives you a common config system, settings plumbing, context helpers, registries, and a small extension surface that registers `/supi-settings`.

## Install

### As a dependency for another extension

```bash
pnpm add @mrclrchtr/supi-core
```

### As a pi package

```bash
pi install npm:@mrclrchtr/supi-core
```

Installing it as a pi package adds the minimal `/supi-settings` extension surface.

## Package surfaces

- `@mrclrchtr/supi-core/api` — reusable helpers for other packages and extensions
- `@mrclrchtr/supi-core/extension` — minimal pi extension that registers `/supi-settings`

## What you get from the API

### Config helpers

- `loadSupiConfig()` — merged config with resolution order `defaults <- global <- project`
- `loadSupiConfigForScope()` — load one scope at a time for settings UIs
- `writeSupiConfig()` — persist values
- `removeSupiConfigKey()` — remove a key or override

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

### Settings helpers

- `registerSettings()` — register an arbitrary settings section
- `registerConfigSettings()` — register a config-backed settings section with scoped persistence helpers
- `registerSettingsCommand()` — register `/supi-settings`
- `openSettingsOverlay()` — open the shared settings UI directly
- `createInputSubmenu()` — helper for simple text-entry submenus

The built-in settings UI supports:

- project/global scope toggle
- grouped extension sections
- searchable setting lists

### Context helpers

- `wrapExtensionContext()` — wrap injected text in SuPi's `<extension-context>` tag
- `findLastUserMessageIndex()`
- `getContextToken()`
- `getPromptContent()`
- `pruneAndReorderContextMessages()`
- `restorePromptContent()`

### Shared registries

- context-provider registry for `/supi-context`
- debug-event registry for producers that want shared debug capture
- settings registry used by `/supi-settings`

### Project and session helpers

- project-root detection and directory walking helpers such as `findProjectRoot()` and `walkProject()`
- active-branch session helper: `getActiveBranchEntries()`
- terminal helpers such as `formatTitle()`, `signalWaiting()`, and `signalDone()`

## Example

```ts
import { loadSupiConfig, registerConfigSettings, wrapExtensionContext } from "@mrclrchtr/supi-core/api";

const config = loadSupiConfig("my-extension", process.cwd(), {
  enabled: true,
});

registerConfigSettings({
  id: "my-extension",
  label: "My Extension",
  section: "my-extension",
  defaults: { enabled: true },
  buildItems: () => [],
  persistChange: () => {},
});

const message = wrapExtensionContext("my-extension", "hello", {
  file: "CLAUDE.md",
  turn: 1,
});
```

## Source

- `src/api.ts` — exported library surface
- `src/extension.ts` — minimal `/supi-settings` entrypoint
- `src/config.ts` — shared config loading and writing
- `src/config-settings.ts` — config-backed settings registration helper
- `src/settings-ui.ts` — shared settings overlay
