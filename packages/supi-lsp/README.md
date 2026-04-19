# @mrclrchtr/supi-lsp

Language Server Protocol integration for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-lsp
```

## What it adds

This extension registers the `lsp` tool and related agent guidance so pi can use language-server features instead of relying only on plain-text search.

Key capabilities:

- `lsp` tool with `hover`, `definition`, `references`, `diagnostics`, `symbols`, `rename`, and `code_actions`
- proactive project scanning and eager startup of detected language servers on session start
- inline diagnostic surfacing around reads, writes, and edits
- compact diagnostic context injection when outstanding diagnostics change
- `/lsp-status` status overlay for servers, roots, open files, and diagnostics

This package also bundles the `supi-lsp-guide` skill.

## Tool actions

The `lsp` tool supports these actions:

- `hover`
- `definition`
- `references`
- `diagnostics`
- `symbols`
- `rename`
- `code_actions`

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

Environment variables:

- `PI_LSP_DISABLED=1` — disable the extension
- `PI_LSP_SERVERS=rust-analyzer,pyright` — allow-list active servers
- `PI_LSP_SEVERITY=1|2|3|4` — inline diagnostic threshold

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

- Entrypoint: `lsp.ts`
- Skill resources: `resources/supi-lsp-guide/`
