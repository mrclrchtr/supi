<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-settings">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-settings/assets/social-preview.png" alt="SuPi Settings" width="100%">
  </a>
</div>

# @mrclrchtr/supi-settings

SuPi Settings adds a unified `/supi-settings` command to the [pi coding agent](https://github.com/earendil-works/pi). It gives SuPi extensions one shared TUI for project and global configuration.

## Install

```bash
pi install npm:@mrclrchtr/supi-settings
```

For local development:

```bash
pi install ./packages/supi-settings
```

## What you get

After install, pi gets one new slash command:

- **`/supi-settings`** — open a searchable settings screen for registered SuPi extension settings

The screen matches Pi's `/settings` layout and groups settings by extension. It shows current values with source badges like `(project)`, `(global)`, and `(default)`. Use `Tab` to switch between **project** and **global** scopes. Row actions can set a scoped value or delete it with **Inherit** / **Reset to default**.

## How it works

`supi-settings` is the command package for the shared settings registry in `@mrclrchtr/supi-core`.

Other SuPi extensions register asynchronous Settings Modules during extension startup. This package reads their source-aware snapshots, routes `set` and `unset` actions, and shows module-reported failures or reload notices. Fixed SuPi config sections use the shared config adapter; dynamic modules can own other stores without exposing them to this UI.

If no installed SuPi extension has registered settings, `/supi-settings` reports that there are no settings to edit.

## Typical settings sections

Depending on which SuPi packages are installed, the overlay may include settings for:

- `supi-lsp` — language-server enablement and diagnostics behavior
- `supi-claude-md` — subdirectory `CLAUDE.md` / `AGENTS.md` discovery
- `supi-bash-timeout` — default bash timeout injection
- `supi-cache` — prompt-cache monitoring and history collection
- `supi-debug` — debug event capture and retention
- `supi-insights` — report-generation options
- `supi-skills` — skill load and model-invocation controls

## Package surfaces

- `@mrclrchtr/supi-settings/extension` — pi extension entrypoint, registers `/supi-settings`
- `@mrclrchtr/supi-settings/api` — settings UI and submenu helpers

## Source layout

- `src/extension.ts` — pi extension entrypoint
- `src/api.ts` — reusable settings UI surface
- `src/ui/` — settings screen, scoped list, action menu, and submenus
- `@mrclrchtr/supi-core/settings` owns the registry, schema, scope resolution, and persistence
