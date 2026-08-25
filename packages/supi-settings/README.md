<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-settings">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-settings/assets/social-preview.png" alt="SuPi Settings" width="100%">
  </a>
</div>

# @mrclrchtr/supi-settings

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-settings)](https://www.npmjs.com/package/@mrclrchtr/supi-settings)

SuPi Settings is a Pi extension and a small public UI library. It adds one interactive screen for the project and global settings that loaded SuPi extensions contribute.

This package is part of the SuPi release stack.

## Install

Install the Pi extension:

```bash
pi install npm:@mrclrchtr/supi-settings
```

If Pi is open, run `/reload` after installation.

For local development:

```bash
pi install ./packages/supi-settings
```

## What it adds

The extension registers one slash command:

- **`/supi-settings`** — open a searchable settings screen

The package does not register a tool, a shortcut, or its own setting. The screen contains settings from other loaded SuPi extensions. If no extension contributes settings, Pi shows `No settings registered by SuPi extensions`.

The screen is available in Pi interactive TUI mode. Print, JSON, and RPC modes do not provide this custom screen.

## Use the settings screen

The screen starts in project scope.

| Input | Action |
|---|---|
| Type text | Filter by section, setting, key, or displayed value |
| Up or Down | Move through the settings |
| Enter | Open the actions for the selected setting |
| Space | Cycle a boolean, enum, or fixed numeric choice |
| Tab | Switch between project and global scope |
| Escape | Close the current menu or the settings screen |

Each value can have a `(project)`, `(global)`, or `(default)` source badge.

In project scope, a project value overrides a global value or the package default. **Inherit from global** and **Use default** delete the project value. In global scope, **Reset to default** deletes the global value.

Free-text, list, model, and custom settings open a matching editor or picker when the contributing module provides one.

## Storage and boundaries

Each contributing settings module owns its reads, writes, validation, refresh behavior, and notices. The screen waits for a write to finish and then reads a new snapshot. A failure in one module does not hide settings from modules that loaded successfully.

Modules that use the standard `@mrclrchtr/supi-core` config adapter store values in:

- global: `~/.pi/agent/supi/config.json`
- project: `<cwd>/.pi/supi/config.json`

A custom module can use a different store. SuPi Settings does not call a model or a remote service itself, but a contributed module controls its own operations. Pi extensions run with the permissions of the Pi process.

## Public API

Add the package as a dependency when another extension needs the reusable UI helpers:

```bash
pnpm add @mrclrchtr/supi-settings
```

Import only from the explicit API subpath:

```ts
import {
  createInputSubmenu,
  createModelPickerSubmenu,
  openSettingsOverlay,
} from "@mrclrchtr/supi-settings/api";
```

The API exports:

- `openSettingsOverlay(pi, ctx)` — collect the current settings modules and open the screen.
- `createInputSubmenu(currentValue, label, done)` — create a free-text submenu with confirm and cancel handling.
- `createModelPickerSubmenu(currentValue, done, ctx?, options?)` — create a picker from static choices and models that match Pi's configured `enabledModels` patterns. The picker includes `disabled` by default.

The `@mrclrchtr/supi-settings/extension` subpath exports the Pi extension factory that registers `/supi-settings`.

Settings modules use `registerSettings()` and the `SettingsModule` types from `@mrclrchtr/supi-core/settings`. Their `read()` and `apply()` methods are asynchronous. The screen collects the modules when the command opens.

## Source layout

- `src/extension.ts` — Pi extension entrypoint
- `src/api.ts` — public UI exports
- `src/ui/` — settings screen, scoped list, action menu, and submenus
