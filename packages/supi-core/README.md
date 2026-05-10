# @mrclrchtr/supi-core

Shared infrastructure for SuPi packages.

## Install

Use it as a dependency in another extension package:

```bash
pnpm add @mrclrchtr/supi-core
```

## Package role

`@mrclrchtr/supi-core` is a library package. It does **not** register a pi extension and is not meant to be installed as a standalone pi package.

## What it provides

Current exports cover:

- shared config loading, scoped reads, writes, and key removal
- config-backed settings registration helpers for `/supi-settings`
- the shared settings registry, overlay UI, and `registerSettingsCommand()` helper
- XML `<extension-context>` wrapping plus context-message utilities
- context-provider and debug-event registries reused across SuPi packages
- project root and path helpers reused by packages such as `supi-lsp`

## Config system

Config resolution order:

```text
defaults <- global <- project
```

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Main helpers:

- `loadSupiConfig()` — effective merged config (`defaults <- global <- project`)
- `loadSupiConfigForScope()` — raw single-scope config for settings UIs (`defaults <- selected scope`)
- `writeSupiConfig()`
- `removeSupiConfigKey()`
- `registerConfigSettings()`

## Context and settings helpers

- `wrapExtensionContext()`
- `findLastUserMessageIndex()`
- `getContextToken()`
- `pruneAndReorderContextMessages()`
- `registerSettings()`
- `registerSettingsCommand()`
- `openSettingsOverlay()`

## Example

```ts
import { loadSupiConfig, registerConfigSettings, wrapExtensionContext } from "@mrclrchtr/supi-core";

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
  turn: 1,
  file: "CLAUDE.md",
});
```

## Requirements

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`

## Source

- Main exports: `src/index.ts`
