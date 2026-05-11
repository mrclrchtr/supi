# @mrclrchtr/supi

SuPi (**Super Pi**) is an opinionated bundle of extensions, skills, and supporting packages for the [pi coding agent](https://github.com/earendil-works/pi).

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

`@mrclrchtr/supi` exposes wrapper entrypoints for these extensions:

- `extras.ts` — command aliases, skill shorthand, tab spinner, prompt stash, git editor guard
- `ask-user.ts` — structured `ask_user` tool
- `bash-timeout.ts` — default `bash` timeout injection
- `claude-md.ts` — subdirectory `CLAUDE.md` / `AGENTS.md` injection
- `settings.ts` — shared `/supi-settings` command
- `lsp.ts` — Language Server Protocol tooling
- `review.ts` — structured `/supi-review`
- `debug.ts` — recent SuPi debug event inspection
- `rtk.ts` — RTK-backed `bash` rewriting
- `context.ts` — detailed context usage reporting
- `tree-sitter.ts` — structural AST analysis
- `cache.ts` — cache monitoring and forensics
- `code-intelligence.ts` — architecture briefs and impact analysis
- `insights.ts` — historical session insights report generation

Bundled sub-packages also contribute skills through `resources_discover`, notably `supi-claude-md`.

## Bundled packages

| Package | Type | Purpose |
| --- | --- | --- |
| [`@mrclrchtr/supi`](./README.md) | meta-package | Full SuPi bundle for pi installs |
| [`@mrclrchtr/supi-ask-user`](../supi-ask-user/README.md) | extension | Structured `ask_user` tool and rich questionnaire UI |
| [`@mrclrchtr/supi-bash-timeout`](../supi-bash-timeout/README.md) | extension | Injects default timeouts into `bash` tool calls |
| [`@mrclrchtr/supi-cache`](../supi-cache/README.md) | extension | Prompt cache monitoring and cross-session forensics |
| [`@mrclrchtr/supi-claude-md`](../supi-claude-md/README.md) | extension + skills | Subdirectory context injection plus CLAUDE.md maintenance skills |
| [`@mrclrchtr/supi-code-intelligence`](../supi-code-intelligence/README.md) | extension + library | Architecture briefs, callers/callees, impact analysis, and project indexing |
| [`@mrclrchtr/supi-context`](../supi-context/README.md) | extension | Detailed `/supi-context` usage reporting |
| [`@mrclrchtr/supi-core`](../supi-core/README.md) | library | Shared config, settings, context, debug, and project-root helpers |
| [`@mrclrchtr/supi-debug`](../supi-debug/README.md) | extension | Session-local debug event inspection |
| [`@mrclrchtr/supi-extras`](../supi-extras/README.md) | extension | Command aliases, skill shorthand, tab spinner, prompt stash, and other small utilities |
| [`@mrclrchtr/supi-insights`](../supi-insights/README.md) | extension | Historical session insights and HTML reports |
| [`@mrclrchtr/supi-lsp`](../supi-lsp/README.md) | extension + library | LSP tool, diagnostics, and reusable session-scoped LSP service |
| [`@mrclrchtr/supi-review`](../supi-review/README.md) | extension | Structured `/supi-review` command with configurable reviewer behavior |
| [`@mrclrchtr/supi-rtk`](../supi-rtk/README.md) | extension | Transparent RTK-backed `bash` rewriting |
| [`@mrclrchtr/supi-tree-sitter`](../supi-tree-sitter/README.md) | extension + library | Tree-sitter structural analysis tool and reusable parse/query services |

## Install individual packages

```bash
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-bash-timeout
pi install npm:@mrclrchtr/supi-cache
pi install npm:@mrclrchtr/supi-claude-md
pi install npm:@mrclrchtr/supi-code-intelligence
pi install npm:@mrclrchtr/supi-context
pi install npm:@mrclrchtr/supi-debug
pi install npm:@mrclrchtr/supi-extras
pi install npm:@mrclrchtr/supi-insights
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-review
pi install npm:@mrclrchtr/supi-rtk
pi install npm:@mrclrchtr/supi-tree-sitter
```

## Notable included behavior

### `ask_user`

Adds a structured tool for narrow agent-user decisions with typed questions, recommendations, discuss flows, and rich previews.

### `claude-md`

Keeps directory-specific `CLAUDE.md` and `AGENTS.md` guidance flowing into sessions for subdirectories below `cwd`. Root and ancestor context files remain pi-native.
### `lsp`

Adds semantic code navigation and diagnostics through a single `lsp` tool plus inline diagnostic surfacing and `/lsp-status`. Also exports a reusable `SessionLspService` library surface from the package root so peer extensions can reuse the active LSP runtime without starting duplicate servers.

### `tree_sitter`

Adds parser-backed structural analysis for supported file families. `node_at` and `query` work across all supported grammars; `outline`, `imports`, and `exports` are currently JavaScript / TypeScript only.

### `review`

Adds `/supi-review` for structured code review in an in-process managed child session. Configure reviewer model overrides, max diff size, and review timeout through `/supi-settings`.

### Small UX improvements

- command aliases and `$skill-name` shorthand via `supi-extras`
- default shell timeouts via `supi-bash-timeout`
- cache and debug inspection tools via `supi-cache` and `supi-debug`
