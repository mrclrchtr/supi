# @mrclrchtr/supi

SuPi (**Super Pi**) is an opinionated bundle of extensions, prompts, and supporting packages for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

Install the full stack or pick individual packages.

## Install

### Full stack

```bash
pi install npm:@mrclrchtr/supi
```

### From git or a local checkout

```bash
# Git install
pi install git:github.com/mrclrchtr/supi

# Local checkout
pi install /path/to/supi/packages/supi
```

When installed from a local path, pi loads the working tree directly. After edits, use `/reload` or restart pi.

## What the meta-package bundles

The `@mrclrchtr/supi` package exposes wrapper entrypoints for the main SuPi extensions and contributes prompt and skill resource directories.

Included extension entrypoints:

- `aliases.ts`
- `ask-user.ts`
- `bash-timeout.ts`
- `claude-md.ts`
- `lsp.ts`
- `tree-sitter.ts`
- `skill-shortcut.ts`
- `review.ts`
- `resources.ts`

Current bundled prompt templates:

- `prompts/revise-claude-md.md`

## Packages

| Package | Type | Purpose |
| --- | --- | --- |
| [`@mrclrchtr/supi`](./README.md) | meta-package | Full SuPi bundle for pi installs |
| [`@mrclrchtr/supi-aliases`](../supi-aliases/README.md) | extension | `/exit`, `/e`, and `/clear` shortcuts |
| [`@mrclrchtr/supi-ask-user`](../supi-ask-user/README.md) | extension | Structured `ask_user` tool and rich questionnaire UI |
| [`@mrclrchtr/supi-bash-timeout`](../supi-bash-timeout/README.md) | extension | Injects default timeouts into `bash` tool calls |
| [`@mrclrchtr/supi-claude-md`](../supi-claude-md/README.md) | extension | Subdirectory context injection and root context refresh |
| [`@mrclrchtr/supi-lsp`](../supi-lsp/README.md) | extension | Language Server Protocol tool, diagnostics, and semantic guidance |
| [`@mrclrchtr/supi-tree-sitter`](../supi-tree-sitter/README.md) | extension/library | Tree-sitter structural analysis tool and reusable parse/query services |
| [`@mrclrchtr/supi-review`](../supi-review/package.json) | extension | Structured `/supi-review` command with configurable models, diff size, and review timeout |
| [`@mrclrchtr/supi-skill-shortcut`](../supi-skill-shortcut/README.md) | extension | `$skill-name` shorthand and autocomplete |
| [`@mrclrchtr/supi-core`](../supi-core/README.md) | library | Shared config and context utilities used by SuPi packages |

## Install individual packages

```bash
pi install npm:@mrclrchtr/supi-aliases
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-bash-timeout
pi install npm:@mrclrchtr/supi-claude-md
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-tree-sitter
pi install npm:@mrclrchtr/supi-skill-shortcut
pi install npm:@mrclrchtr/supi-review
```

## Notable included behavior

### `ask_user`

Adds a structured tool for narrow agent-user decisions with typed questions, recommendations, discuss flows, and rich previews.

### `claude-md`

Keeps directory-specific `CLAUDE.md` and `AGENTS.md` guidance flowing into sessions, including periodic refresh of root context.

### `lsp`

Adds semantic code navigation and diagnostics through a single `lsp` tool plus inline diagnostic surfacing and `/lsp-status`. Also exports a reusable `SessionLspService` library surface from the package root so peer extensions can reuse the active LSP runtime without starting duplicate servers.

### `tree_sitter`

Adds syntax-tree-level structure for JavaScript and TypeScript files through `outline`, `imports`, `exports`, `node_at`, and custom query actions. Results use 1-based coordinates compatible with `lsp` and are capped for agent-friendly output. Designed as a standalone structural-analysis substrate that remains correct when installed without `supi-lsp`.

### `review`

Adds `/supi-review` for structured code review in a dedicated read-only subprocess. Configure fast/deep model overrides, max diff size, and review timeout in minutes through `/supi-settings`.

### Small UX improvements

- command aliases via `supi-aliases`
- default shell timeouts via `supi-bash-timeout`
- `$skill-name` shorthand via `supi-skill-shortcut`

