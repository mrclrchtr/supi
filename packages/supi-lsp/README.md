# @mrclrchtr/supi-lsp

Language Server Protocol integration for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-lsp
```

## What it adds

- `lsp` tool with `hover`, `definition`, `references`, `diagnostics`, `symbols`, `rename`, `code_actions`, `workspace_symbol`, `search`, `symbol_hover`, and `recover`
- Stable system-prompt guidance that tells the agent to prefer LSP over grep/rg for code navigation
- Proactive project scanning and eager startup of detected language servers
- Automatic stale-diagnostic recovery when workspace sentinels change (`package.json`, root lockfiles, `tsconfig*`, generated `*.d.ts` files`) before the next agent turn, plus immediate recovery after successful `write` or `edit` calls for those paths
- Inline diagnostic surfacing around reads, writes, and edits
- Compact diagnostic context injection when outstanding diagnostics change, with stale-diagnostic warnings when needed
- `/lsp-status` status overlay

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

Peer extensions can import from the package root without reaching into private files.

## Tool actions

The `lsp` tool supports these actions:

- `hover`: type info at a position
- `definition`: go to definition
- `references`: find all references
- `diagnostics`: per-file or project-wide diagnostics
- `symbols`: document symbols
- `rename`: workspace-wide rename
- `code_actions`: quick fixes at a position
- `workspace_symbol`: fuzzy symbol search across the project
- `search`: symbol search with text fallback
- `symbol_hover`: hover by symbol name
- `recover`: refresh diagnostics after workspace-wide dependency, config, or generated-type changes

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

If your install surface includes `/supi-settings` (for example via `@mrclrchtr/supi`), this package contributes an LSP settings section there. Use that panel to:

- enable or disable LSP globally
- control the severity threshold
- select active language servers
- configure file exclusion patterns

## Commands

`/lsp-status` toggles an overlay showing active language servers and outstanding diagnostics:

```text
 λ LSP inspector  /lsp-status toggles
 3 servers running • 12 open files • 5 errors • 2 warnings

 Servers
   typescript  running    24 open files
   python      running     8 open files
   bash        running     0 open files

 Problems
   src/lsp.ts:42       Cannot find name 'foo'          ts(2304)
   src/manager.ts:108  Property 'bar' does not exist   ts(2339)
```

When no servers are available, the overlay shows `no LSP servers available for this project`. A compact status summary is always visible in the pi status bar.

## Requirements

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`
- relevant language servers installed and available on `PATH`
- `@mrclrchtr/supi-core`

## Source

- Extension entrypoint: `lsp.ts`
- Public library surface: `index.ts`
