# @mrclrchtr/supi

SuPi (**Super Pi**) is my curated extension stack for the [pi coding agent](https://github.com/earendil-works/pi) — a collection of extensions I use daily and am happy to share.

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

`@mrclrchtr/supi` now exposes two explicit surfaces:

- `@mrclrchtr/supi/extension` — one aggregated extension entrypoint for the Production stack
- `@mrclrchtr/supi/api` — a namespaced umbrella API re-exporting Production package `/api` surfaces

Bundled sub-packages still contribute skills through `resources_discover`, notably `supi-claude-md`.

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
| [`@mrclrchtr/supi-core`](../supi-core/README.md) | library + extension | Shared config, settings, context, debug, project-root helpers, and the minimal `/supi-settings` extension |
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
pi install npm:@mrclrchtr/supi-core
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

Adds semantic code navigation and diagnostics through a single `lsp` tool plus inline diagnostic surfacing and `/lsp-status`. Peer extensions should import the reusable `SessionLspService` surface from `@mrclrchtr/supi-lsp/api`.

### `tree_sitter`

Adds parser-backed structural analysis for supported file families. `node_at` and `query` work across all supported grammars; `outline`, `imports`, and `exports` are currently JavaScript / TypeScript only.

## Import surfaces

Published SuPi packages use explicit subpaths:

- `/extension` — pi extension entrypoint
- `/api` — programmatic package API

`pi.extensions` in each package manifest still uses real file paths such as `./src/extension.ts`; the `exports` subpaths are for package consumers, not for PI manifest discovery.

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
