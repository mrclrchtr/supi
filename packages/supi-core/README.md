<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-core">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-core/assets/social-preview.png" alt="SuPi Core" width="100%">
  </a>
</div>

# @mrclrchtr/supi-core

Shared infrastructure for SuPi extensions.

This is a **pure library** — it does not register any pi commands or tools. The `/supi-settings` command is now available through `@mrclrchtr/supi-settings`.

## Install

```bash
pnpm add @mrclrchtr/supi-core
```

## Package surfaces

- `@mrclrchtr/supi-core/api` — reusable helpers for other packages and extensions
- `@mrclrchtr/supi-core/report` — shared text/report rendering helpers for TUI and plain-text summaries

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

- `registerDeclarativeSettings(pi, options)` — contribute a config-backed declarative settings section with source-aware scoped persistence
- settings registry helpers and types for the `@mrclrchtr/supi-settings` configuration surface

### Context helpers

- `wrapExtensionContext()` — wrap injected text in SuPi's `<extension-context>` tag

### Shared registries

- context-provider registry for `/supi-context`
- debug-event registry for producers that want shared debug capture
- settings registry used by `/supi-settings`

### Project and session helpers

- project-root detection and directory walking helpers such as `findProjectRoot()` and `walkProject()`
- active-branch session helper: `getActiveBranchEntries()`
- terminal helpers such as `formatTitle()`, `signalWaiting()`, and `signalDone()`

### Report helpers

- `clampReportWidth()` — enforce a minimum readable report width
- `formatReportTitle()` / `formatSectionHeader()` — shared themed headers
- `formatDimLine()` / `formatKeyValueLine()` — common summary rows
- `formatOverflowHint()` — consistent preview-overflow hints
- `wrapReportText()` — ANSI-aware wrapped report blocks with optional indentation

## Example

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig, registerDeclarativeSettings, wrapExtensionContext } from "@mrclrchtr/supi-core/api";

export default function myExtension(pi: ExtensionAPI) {
  const defaults = { enabled: true };
  const config = loadSupiConfig("my-extension", process.cwd(), defaults);

  registerDeclarativeSettings(pi, {
    id: "my-extension",
    label: "My Extension",
    section: "my-extension",
    defaults,
    fields: [
      {
        kind: "boolean" as const,
        key: "enabled",
        label: "Enabled",
      },
    ],
  });

  const message = wrapExtensionContext("my-extension", "hello", {
    enabled: config.enabled,
  });
  void message;
}
```

## Source

- `src/api.ts` — exported library surface
- `src/config.ts` — shared config loading and writing
- `src/settings/` — settings registry, schema, scope resolution, and persistence
- `src/report.ts` — shared text/report rendering helpers
