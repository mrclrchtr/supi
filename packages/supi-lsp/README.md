# @mrclrchtr/supi-lsp

Language Server Protocol integration for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-lsp
```

## What it adds

This extension registers the `lsp` tool and related agent guidance so pi can use language-server features instead of relying only on plain-text search.

Key capabilities:

- `lsp` tool with `hover`, `definition`, `references`, `diagnostics`, `symbols`, `rename`, `code_actions`, `workspace_symbol`, `search`, and `symbol_hover`
- stable system-prompt guidance — `promptGuidelines` direct the agent to prefer LSP over grep/rg for code navigation, with active server info
- proactive project scanning and eager startup of detected language servers on session start
- inline diagnostic surfacing around reads, writes, and edits
- compact diagnostic context injection when outstanding diagnostics change
- `/lsp-status` status overlay for servers, roots, open files, and diagnostics

## Public library API

In addition to the extension entrypoint, `@mrclrchtr/supi-lsp` exports a reusable session-scoped service API for peer extensions:

```ts
import { getSessionLspService, SessionLspService } from "@mrclrchtr/supi-lsp";

const state = getSessionLspService("/project");

if (state.kind === "ready") {
  const service = state.service;
  const hover = await service.hover("src/index.ts", { line: 5, character: 10 });
  const defs = await service.definition("src/index.ts", { line: 5, character: 10 });
  const refs = await service.references("src/index.ts", { line: 5, character: 10 });
  const impls = await service.implementation("src/index.ts", { line: 5, character: 10 });
  const symbols = await service.documentSymbols("src/index.ts");
  const projectServers = service.getProjectServers();
}
```

Peer extensions can import from the package root without reaching into private files. The shared registry is keyed by session `cwd` and updated automatically during `session_start` and `session_shutdown`. Service file path inputs may be absolute or relative to that session `cwd`.

## Tool actions

The `lsp` tool supports these actions:

- `hover` — type info at a position
- `definition` — go to definition
- `references` — find all references
- `diagnostics` — per-file or project-wide diagnostics
- `symbols` — document symbols
- `rename` — workspace-wide rename
- `code_actions` — quick fixes at a position
- `workspace_symbol` — fuzzy symbol search across the project
- `search` — symbol search with text fallback
- `symbol_hover` — hover by symbol name

Line and character positions are **1-based**.

Example:

```json
{
  "action": "definition",
  "file": "src/index.ts",
  "line": 12,
  "character": 8
}
```

## Configuration

Settings are managed through `/supi-settings` (registered by the `supi` meta-package). Use the LSP settings panel to enable/disable LSP, control the severity threshold, and select active servers.

Project config:

- `.pi-lsp.json` in the project root — override, add, or disable server definitions

## Commands

```text
/lsp-status
```

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `typebox`
- relevant language servers installed and available on `PATH`
- `@mrclrchtr/supi-core`

## Source

- Extension entrypoint: `lsp.ts`
- Public library surface: `index.ts`
- Skill resources: `resources/supi-lsp-guide/`
