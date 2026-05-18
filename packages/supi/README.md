# @mrclrchtr/supi

SuPi (**Super Pi**) is the full curated extension stack for the [pi coding agent](https://github.com/earendil-works/pi).

Install this package when you want the main SuPi set in one step instead of picking packages one by one.

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

When installed from a local path, pi loads the working tree directly. After edits, run `/reload`.

## What the full stack includes

The meta-package currently bundles these production packages:

| Package | What you get |
| --- | --- |
| [`@mrclrchtr/supi-ask-user`](../supi-ask-user/README.md) | `ask_user` for focused interactive questionnaires |
| [`@mrclrchtr/supi-bash-timeout`](../supi-bash-timeout/README.md) | default timeout injection for `bash` |
| [`@mrclrchtr/supi-claude-md`](../supi-claude-md/README.md) | subdirectory `CLAUDE.md` / `AGENTS.md` context discovery |
| [`@mrclrchtr/supi-code-intelligence`](../supi-code-intelligence/README.md) | `code_intel` for briefs, callers, blast radius, and structured search |
| [`@mrclrchtr/supi-context`](../supi-context/README.md) | `/supi-context` context-usage report |
| [`@mrclrchtr/supi-core`](../supi-core/README.md) | shared config/settings plumbing and `/supi-settings` |
| [`@mrclrchtr/supi-debug`](../supi-debug/README.md) | shared debug-event inspection |
| [`@mrclrchtr/supi-extras`](../supi-extras/README.md) | prompt stash, command aliases, skill shorthand, spinner, and other small utilities |
| [`@mrclrchtr/supi-lsp`](../supi-lsp/README.md) | `lsp`, `/lsp-status`, and automatic diagnostics |
| [`@mrclrchtr/supi-tree-sitter`](../supi-tree-sitter/README.md) | `tree_sitter` structural parsing and AST-style queries |

## Direct-install packages not bundled here

These workspace packages are available separately and are **not** included in `@mrclrchtr/supi`:

| Package | Status | What you get |
| --- | --- | --- |
| [`@mrclrchtr/supi-cache`](../supi-cache/README.md) | beta | cache monitoring and cache-regression forensics |
| [`@mrclrchtr/supi-insights`](../supi-insights/README.md) | beta | historical session-analysis reports |
| [`@mrclrchtr/supi-review`](../supi-review/README.md) | beta | guided `/supi-review` code review |
| [`@mrclrchtr/supi-rtk`](../supi-rtk/README.md) | beta | RTK-backed bash rewriting |
| [`@mrclrchtr/supi-web`](../supi-web/README.md) | beta | web-page Markdown fetch and Context7 docs lookup |
| [`@mrclrchtr/supi-test-utils`](../supi-test-utils/README.md) | internal | workspace-only test helpers, not a pi install target |

## Package surfaces

`@mrclrchtr/supi` exposes two explicit subpaths:

- `@mrclrchtr/supi/extension` — aggregated extension entrypoint for the bundled production stack
- `@mrclrchtr/supi/api` — umbrella API that re-exports the bundled package `/api` surfaces under these namespaces: `askUser`, `bashTimeout`, `claudeMd`, `codeIntelligence`, `context`, `core`, `debug`, `extras`, `lsp`, `treeSitter`

## Source

- `src/extension.ts` — aggregated production extension stack
- `src/api.ts` — umbrella API re-exports
