# @mrclrchtr/supi-lsp

Language Server Protocol for PI — your agent navigates code like an IDE.

Without LSP, agents grep and guess. With it, they jump to definitions, find every reference, rename across files, and catch type errors inline. The same precision you get from an editor, available to your agent.

## What you get

### Navigate with precision

Go-to-definition, find-references, rename, hover types. The agent stops guessing and starts navigating your codebase with IDE-level accuracy.

### Catch problems immediately

Type errors, warnings, and hints surface inline after every edit. The agent sees mistakes as it makes them — not 10 turns later when tests fail.

### Always ready

Servers start automatically for your project. The agent gets language-aware guidance at session start and stale diagnostics are refreshed when dependencies change.

## Install

```bash
pi install npm:@mrclrchtr/supi-lsp
```

## Quick look

The agent gets an `lsp` tool. The most-used actions:

| Action | What the agent can do |
|--------|----------------------|
| `hover` | See the type of any symbol |
| `definition` | Jump to where something is defined |
| `references` | Find every usage across the project |
| `diagnostics` | See errors, warnings, and hints |
| `rename` | Rename across the entire project |

Full action reference: the agent's system prompt includes complete guidelines for all 11 actions (hover, definition, references, diagnostics, symbols, rename, code_actions, workspace_symbol, search, symbol_hover, recover). All positions are 1-based.

## Settings

Configure via `/supi-settings` (LSP panel):

- Enable or disable LSP per project
- Set diagnostic severity threshold (errors only, or include warnings/hints)
- Choose which language servers to activate
- Add file exclusion patterns (gitignore-style globs)

Settings are stored in `~/.pi/agent/supi/config.json` (global) or `.pi/supi/config.json` (project). The `/lsp-status` command shows active servers and outstanding diagnostics.

## For extension developers

This package exports a reusable session-scoped LSP service. Peer extensions can query the same LSP runtime without starting duplicate servers:

```ts
import { getSessionLspService, SessionLspService } from "@mrclrchtr/supi-lsp";

const state = getSessionLspService("/project");
if (state.kind === "ready") {
  const defs = await state.service.definition("src/index.ts", { line: 5, character: 10 });
  const refs = await state.service.references("src/index.ts", { line: 5, character: 10 });
}
```

Import from the package root — no need to reach into internal files.
