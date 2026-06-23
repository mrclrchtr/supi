<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-settings">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-settings/assets/logo.png" alt="SuPi" width="50%">
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

- **`/supi-settings`** — open a searchable settings overlay for registered SuPi extension settings

The overlay groups settings by extension, shows current values, and lets you switch between **project** and **global** scopes with `Tab`.

## How it works

`supi-settings` is the command package for the shared settings registry in `@mrclrchtr/supi-core`.

Other SuPi extensions register their settings during extension startup. This package renders those registered sections and persists changes back to the appropriate SuPi config scope.

If no installed SuPi extension has registered settings, `/supi-settings` reports that there are no settings to edit.

## Typical settings sections

Depending on which SuPi packages are installed, the overlay may include settings for:

- `supi-lsp` — language-server enablement and diagnostics behavior
- `supi-claude-md` — subdirectory `CLAUDE.md` / `AGENTS.md` discovery
- `supi-bash-timeout` — default bash timeout injection
- `supi-cache` — prompt-cache monitoring and history collection
- `supi-debug` — debug event capture and retention
- `supi-insights` — report-generation options

## Package surfaces

- `@mrclrchtr/supi-settings/extension` — pi extension entrypoint, registers `/supi-settings`
- `@mrclrchtr/supi-settings/api` — public package surface for future settings helpers

## Source layout

- `src/extension.ts` — pi extension entrypoint
- `src/api.ts` — package API surface
- shared implementation lives in `@mrclrchtr/supi-core/settings` and `@mrclrchtr/supi-core/settings-ui`
