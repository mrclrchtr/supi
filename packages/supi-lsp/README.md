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

After install, pi gets **10 focused expert tools** for semantic language-server analysis:

- `lsp_hover` — semantic type or symbol information at a given position
- `lsp_definition` — go to definition at a known position
- `lsp_references` — find all references to a symbol
- `lsp_implementation` — find implementations of an interface or method
- `lsp_document_symbols` — semantic declarations for one supported file
- `lsp_workspace_symbols` — semantic symbol-name lookup across the project
- `lsp_diagnostics` — current diagnostics for one file or a workspace summary
- `lsp_rename` — semantic rename planning at a known position
- `lsp_code_actions` — semantic fixes or refactors at a known position
- `lsp_recover` — refresh stale diagnostics after workspace changes
- `/lsp-status` — inspect detected servers, roots, open files, and diagnostics

Coordinates use **1-based** line and character positions.

## Automatic behavior

This package does more than register these tools:

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

## Architecture

`@mrclrchtr/supi-lsp` is the **semantic provider** in SuPi's code-understanding stack.
It depends on `@mrclrchtr/supi-core` and provides a session-scoped LSP service.

```text
supi-lsp           ← LSP client + session-scoped service
```

## Package surfaces

- `@mrclrchtr/supi-lsp/api` — reusable session-scoped LSP service and related types
- `@mrclrchtr/supi-lsp/extension` — pi extension entrypoint
- `@mrclrchtr/supi-lsp/provider/lsp-semantic-provider` — shared SemanticProvider adapter

Example:

```ts
import { getSessionLspService, toLspPosition } from "@mrclrchtr/supi-lsp/api";

const state = getSessionLspService("/project");
if (state.kind === "ready") {
  const defs = await state.service.definition("src/index.ts", toLspPosition(6, 11));
}
```

`SessionLspService` methods use raw **0-based LSP positions**. The expert tools (`lsp_hover`, `lsp_definition`, etc.) keep the public 1-based coordinate UX.

## Source

- `src/lsp.ts` — extension wiring, session lifecycle, and `/lsp-status`
- `src/config/` — server config, defaults, capabilities, and exported LSP protocol types
- `src/session/` — session state, scanning, settings registration, tree persistence, and shared service registry
- `src/tool/tool-specs.ts` — single source of truth for the public LSP tool surface
- `src/tool/guidance.ts` — prompt surfaces derived from tool specs
- `src/tool/register-tools.ts` — focused tool registration driven by tool specs
- `src/tool/service-actions.ts` — service-backed tool execution and formatting
- `src/tool/names.ts` — stable tool name constants
- `src/tool/overrides.ts` — read/write/edit overrides for inline diagnostics
- `src/ui/` — custom diagnostic message rendering and the status overlay
- `src/client/`, `src/manager/`, `src/diagnostics/` — runtime engine subsystems
- `src/api.ts` — reusable developer-facing surface
