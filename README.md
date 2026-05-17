# SuPi (Super Pi)

*Is my curated extension stack for PI, I use in every project, shared in case they help you too.*

## What you get

### Code navigation

Go-to-definition, find-references, rename, hover types — your agent navigates your codebase with IDE precision. Combined with AST-level structural analysis and architecture-aware code intelligence, the agent understands your code instead of just grepping it.

**Extensions**: lsp, tree_sitter, code_intel

### Smarter agent interaction

Structured questionnaires keep the agent from spinning when it needs your input. Diagnostics surface problems inline after every edit. Subdirectory context injection keeps the agent focused on the right files. Transparency tools show you exactly what's eating your context window.

**Extensions**: ask_user, claude-md, context, debug

### Everyday friction, removed

Command aliases for muscle memory (`/exit`, `/e`). Default bash timeouts so hung commands don't stall your session. A keyboard-driven prompt stash so you never lose a draft. Small fixes that add up.

**Extensions**: extras, bash-timeout

## Packages

### Production

Included in `@mrclrchtr/supi`. Install the full stack or pick individual packages from the table below.

| Package | Description |
|---|---|
| `@mrclrchtr/supi-lsp` | Go-to-definition, references, rename, hover types, inline diagnostics |
| `@mrclrchtr/supi-tree-sitter` | AST-level structural analysis — outline, imports, exports, queries |
| `@mrclrchtr/supi-code-intelligence` | Architecture briefs, caller/callee analysis, impact assessment |
| `@mrclrchtr/supi-ask-user` | Structured questionnaires for agent-user decisions |
| `@mrclrchtr/supi-claude-md` | Subdirectory context injection + CLAUDE.md maintenance skills |
| `@mrclrchtr/supi-context` | Context window transparency — see what's eating tokens |
| `@mrclrchtr/supi-debug` | Diagnostics guardrails + debug event inspection |
| `@mrclrchtr/supi-extras` | Command aliases, skill shorthand, tab spinner, prompt stash |
| `@mrclrchtr/supi-bash-timeout` | Default timeouts on bash tool calls |

### Beta

Not bundled in the meta-package. Install individually.

| Package | Description |
|---|---|
| `@mrclrchtr/supi-web` | Fetch web pages as clean Markdown + Context7 library docs |
| `@mrclrchtr/supi-cache` | Prompt cache health monitoring and cross-session forensics |
| `@mrclrchtr/supi-insights` | Usage reports and session analytics |
| `@mrclrchtr/supi-review` | Structured code reviews via `/supi-review` |
| `@mrclrchtr/supi-rtk` | Transparent bash command rewriting for token savings |

Each package has its own README with full details, configuration, and API docs.

## Install

### Full stack

```bash
pi install npm:@mrclrchtr/supi
```

All production packages, working together.

### Individual packages

```bash
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-web
# ... any package from the tables above
```

### From git or local path

```bash
pi install git:github.com/mrclrchtr/supi
pi install /path/to/SuPi/packages/supi-lsp
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi.
