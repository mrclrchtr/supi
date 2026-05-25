```
  _____ _    _ _____ _____
 / ____| |  | |  __ \_   _|
| (___ | |  | | |__) || |
 \___ \| |  | |  ___/ | |
 ____) | |__| | |    _| |_
|_____/ \____/|_|   |_____|
   Curated Extension Stack
```

# SuPi (Super Pi)

*Is my curated extension stack for PI, I use in every project, shared in case they help you too.*

## What you get

### Code navigation

Go-to-definition, find-references, rename, hover types — your agent navigates your codebase with IDE precision. Combined with AST-level structural analysis and architecture-aware code intelligence, the agent understands your code instead of just grepping it.

**Extensions**: lsp, tree_sitter, code-intelligence

### Smarter agent interaction

Structured decision forms keep the agent from spinning when it needs your input. Diagnostics surface problems inline after every edit. Subdirectory context injection keeps the agent focused on the right files. Transparency tools show you exactly what's eating your context window.

**Extensions**: ask_user, claude-md, context, debug

### Everyday friction, removed

Command aliases for muscle memory (`/exit`, `/e`). Default bash timeouts so hung commands don't stall your session. A keyboard-driven prompt stash so you never lose a draft. Small fixes that add up.

**Extensions**: extras, bash-timeout

## Packages

### Packages

Install individual packages from the table below. For the full stack, install from the repo root (see Install section).

| Install | Description |
|---|---|
| `pi install npm:@mrclrchtr/supi-lsp` | Go-to-definition, references, rename, hover types, inline diagnostics |
| `pi install npm:@mrclrchtr/supi-tree-sitter` | AST-level structural analysis — outline, imports, exports, queries |
| `pi install npm:@mrclrchtr/supi-code-intelligence` | Architecture briefs, caller/callee analysis, impact assessment |
| `pi install npm:@mrclrchtr/supi-ask-user` | Structured decision forms for agent-user handoff |
| `pi install npm:@mrclrchtr/supi-claude-md` | Subdirectory context injection + CLAUDE.md maintenance skills |
| `pi install npm:@mrclrchtr/supi-context` | Context window transparency — see what's eating tokens |
| `pi install npm:@mrclrchtr/supi-debug` | Diagnostics guardrails + debug event inspection |
| `pi install npm:@mrclrchtr/supi-extras` | Command aliases, skill shorthand, tab spinner, prompt stash |
| `pi install npm:@mrclrchtr/supi-bash-timeout` | Default timeouts on bash tool calls |

### Experimental

| Install | Description |
|---|---|
| `pi install npm:@mrclrchtr/supi-web` | Fetch web pages as clean Markdown + Context7 library docs |
| `pi install npm:@mrclrchtr/supi-cache` | Prompt cache health monitoring and cross-session forensics |
| `pi install npm:@mrclrchtr/supi-insights` | Usage reports and session analytics |
| `pi install npm:@mrclrchtr/supi-review` | Structured code reviews via `/supi-review` |
| `pi install npm:@mrclrchtr/supi-rtk` | Transparent bash command rewriting for token savings |

Each package has its own README with full details, configuration, and API docs.

## Install

### All packages at once

```bash
# Global install
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install-all.sh | bash

# Project-local install (.pi/settings.json)
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install-all.sh | bash -s -- -l
```

### Individual packages

```bash
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-web
# ... any package from the tables above
```

### Full stack (from git or local path)

```bash
pi install git:github.com/mrclrchtr/supi
pi install /path/to/SuPi
```

The repo root includes all packages via its `pi.extensions` manifest. When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi.

## Maintainer notes

- Repo-wide package layout convention: `docs/package-layout.md`
- Standard test buckets: `__tests__/unit/` and `__tests__/integration/`
- Prefer domain folders over catch-all names like `core/` or `shared/`
