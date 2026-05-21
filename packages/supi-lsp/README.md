# @mrclrchtr/supi-lsp

Adds Language Server Protocol support to the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-lsp
```

For local development:

```bash
pi install ./packages/supi-lsp
```

After editing the source, run `/reload`.

## What you get

After install, pi gets:

- `lsp_lookup` — semantic hover, definition, references, and implementation at a known position
- `lsp_document_symbols` — semantic declarations for one supported file
- `lsp_workspace_symbols` — semantic symbol-name lookup across the project
- `lsp_diagnostics` — current diagnostics for one file or a workspace summary
- `lsp_refactor` — semantic rename planning and code actions at a known position
- `lsp_recover` — refresh stale diagnostics after workspace changes
- `/lsp-status` — inspect detected servers, roots, open files, and diagnostics
- automatic LSP-aware diagnostic surfacing around edits and agent turns

Coordinates use **1-based** line and character positions.

## Automatic behavior

This package does more than register a tool:

- starts detected language servers for the current project
- rebuilds project-specific prompt guidance based on active servers
- injects outstanding diagnostics into context before agent turns when issues exist
- adds inline diagnostics after `write` and `edit` results
- watches for workspace changes such as `package.json`, lockfile, `tsconfig`, generated types, and source-file edits so recovery can happen when diagnostics go stale
- warns when configured language-server commands are missing

## Settings

This package registers an **LSP** section in `/supi-settings`.

Available settings:

- `enabled` — turn all LSP behavior on or off
- `severity` — inline diagnostic threshold: `1` errors, `2` warnings, `3` info, `4` hints
- `active` — choose which configured language servers are active; empty means all
- `exclude` — gitignore-style patterns that suppress diagnostics for matching files

Config lives in the standard SuPi config files:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

## Package surfaces

- `@mrclrchtr/supi-lsp/api` — reusable session-scoped LSP service and related types
- `@mrclrchtr/supi-lsp/extension` — pi extension entrypoint

Example:

```ts
import { getSessionLspService, toLspPosition } from "@mrclrchtr/supi-lsp/api";

const state = getSessionLspService("/project");
if (state.kind === "ready") {
  const defs = await state.service.definition("src/index.ts", toLspPosition(6, 11));
}
```

`SessionLspService` methods use raw **0-based LSP positions**. The expert tools (`lsp_lookup`, `lsp_refactor`, etc.) keep the public 1-based coordinate UX.

## Source

- `src/lsp.ts` — extension wiring, session lifecycle, and `/lsp-status`
- `src/config/` — server config, defaults, capabilities, and exported LSP protocol types
- `src/session/` — session state, scanning, settings registration, tree persistence, and shared service registry
- `src/tool/register-tools.ts` — expert tool registration for the split LSP toolset
- `src/tool/service-actions.ts` — service-backed tool execution and formatting
- `src/tool/guidance.ts` / `src/tool/names.ts` — prompt surfaces and stable tool names
- `src/tool/overrides.ts` — read/write/edit overrides for inline diagnostics
- `src/ui/` — custom diagnostic message rendering and the status overlay
- `src/client/`, `src/manager/`, `src/diagnostics/` — runtime engine subsystems
- `src/api.ts` — reusable developer-facing surface
