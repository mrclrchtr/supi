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

- `lsp` — one model-callable tool for semantic code navigation and diagnostics
- `/lsp-status` — inspect detected servers, roots, open files, and diagnostics
- automatic LSP-aware diagnostic surfacing around edits and agent turns

## `lsp` actions

| Action | What it is for |
| --- | --- |
| `hover` | Show type or symbol information at a position |
| `definition` | Jump to where a symbol is defined |
| `references` | Find usages of a symbol |
| `diagnostics` | Show outstanding diagnostics for one file or the workspace |
| `symbols` | List document symbols |
| `rename` | Plan or perform a rename |
| `code_actions` | Show fixes or refactors at a position |
| `workspace_symbol` | Search symbols across the project |
| `search` | Search symbols with LSP first, then text fallback |
| `symbol_hover` | Hover by symbol name without coordinates |
| `recover` | Refresh diagnostics after workspace changes |

Positions use **1-based** line and character coordinates.

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
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";

const state = getSessionLspService("/project");
if (state.kind === "ready") {
  const defs = await state.service.definition("src/index.ts", { line: 5, character: 10 });
}
```

## Source

- `src/lsp.ts` — extension wiring, tool registration, session lifecycle, and `/lsp-status`
- `src/config/` — server config, defaults, capabilities, and exported LSP protocol types
- `src/session/` — session state, scanning, settings registration, tree persistence, and shared service registry
- `src/tool/` — prompt guidance, action execution, and tool-result overrides
- `src/ui/` — custom diagnostic message rendering and the status overlay
- `src/client/`, `src/manager/`, `src/diagnostics/` — runtime engine subsystems
- `src/api.ts` — reusable developer-facing surface
