# @mrclrchtr/supi

SuPi (**Super Pi**) is an opinionated bundle of production-ready extensions, skills, and supporting packages for the [pi coding agent](https://github.com/earendil-works/pi).

Install the full stack or pick individual packages.

## Package tiers

### ✅ Production (shipped in this meta-package)

Stable, well-tested packages bundled in `@mrclrchtr/supi`.

### 🧪 Beta (direct-install only)

Experimental or niche packages available individually. Not included in the meta-package. Install with:

```bash
pi install npm:@mrclrchtr/supi-cache
pi install npm:@mrclrchtr/supi-insights
pi install npm:@mrclrchtr/supi-review
pi install npm:@mrclrchtr/supi-rtk
```

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

`@mrclrchtr/supi` exposes wrapper entrypoints for these Production extensions:

- `extras.ts` — command aliases, skill shorthand, tab spinner, prompt stash, git editor guard
- `ask-user.ts` — structured `ask_user` tool
- `bash-timeout.ts` — default `bash` timeout injection
- `claude-md.ts` — subdirectory `CLAUDE.md` / `AGENTS.md` injection
- `settings.ts` — shared `/supi-settings` command
- `lsp.ts` — Language Server Protocol tooling
- `debug.ts` — recent SuPi debug event inspection
- `context.ts` — detailed context usage reporting
- `tree-sitter.ts` — structural AST analysis
- `code-intelligence.ts` — architecture briefs and impact analysis

Bundled sub-packages also contribute skills through `resources_discover`, notably `supi-claude-md`.

### Beta packages

The following packages are available as direct installs and are **not** bundled in the meta-package:

- `supi-cache` — prompt cache health monitoring and cross-session forensics
- `supi-insights` — historical session insights and HTML report generation
- `supi-review` — structured `/supi-review` code review
- `supi-rtk` — transparent RTK-backed bash rewriting

## Bundled packages

| Package | Type | Purpose |
| --- | --- | --- |
| [`@mrclrchtr/supi`](./README.md) | meta-package | Full SuPi bundle for pi installs |
| [`@mrclrchtr/supi-ask-user`](../supi-ask-user/README.md) | extension | Structured `ask_user` tool and rich questionnaire UI |
| [`@mrclrchtr/supi-bash-timeout`](../supi-bash-timeout/README.md) | extension | Injects default timeouts into `bash` tool calls |
| [`@mrclrchtr/supi-claude-md`](../supi-claude-md/README.md) | extension + skills | Subdirectory context injection plus CLAUDE.md maintenance skills |
| [`@mrclrchtr/supi-code-intelligence`](../supi-code-intelligence/README.md) | extension + library | Architecture briefs, callers/callees, impact analysis, and project indexing |
| [`@mrclrchtr/supi-context`](../supi-context/README.md) | extension | Detailed `/supi-context` usage reporting |
| [`@mrclrchtr/supi-core`](../supi-core/README.md) | library | Shared config, settings, context, debug, and project-root helpers |
| [`@mrclrchtr/supi-debug`](../supi-debug/README.md) | extension | Session-local debug event inspection |
| [`@mrclrchtr/supi-extras`](../supi-extras/README.md) | extension | Command aliases, skill shorthand, tab spinner, prompt stash, and other small utilities |
| [`@mrclrchtr/supi-lsp`](../supi-lsp/README.md) | extension + library | LSP tool, diagnostics, and reusable session-scoped LSP service |
| [`@mrclrchtr/supi-tree-sitter`](../supi-tree-sitter/README.md) | extension + library | Tree-sitter structural analysis tool and reusable parse/query services |

## Install individual packages

### Production extensions

```bash
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-bash-timeout
pi install npm:@mrclrchtr/supi-claude-md
pi install npm:@mrclrchtr/supi-code-intelligence
pi install npm:@mrclrchtr/supi-context
pi install npm:@mrclrchtr/supi-debug
pi install npm:@mrclrchtr/supi-extras
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-tree-sitter
```

### Beta extensions

```bash
pi install npm:@mrclrchtr/supi-cache
pi install npm:@mrclrchtr/supi-insights
pi install npm:@mrclrchtr/supi-review
pi install npm:@mrclrchtr/supi-rtk
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

### Small UX improvements

- command aliases and `$skill-name` shorthand via `supi-extras`
- default shell timeouts via `supi-bash-timeout`
- debug inspection tools via `supi-debug`

### Beta extensions

Install separately for:
- `supi-cache` — cache monitoring and forensics
- `supi-insights` — historical session analytics reports
- `supi-review` — structured code reviews
- `supi-rtk` — RTK-backed bash rewriting
