# SuPi

**Super Pi**

*My curated extension stack for PI.*

PI is a great coding agent. SuPi makes it better — these are the extensions I use in every project, shared in case they help you too.

## What you get

### Code navigation that works

Go-to-definition, find-references, rename, hover types — your agent navigates your codebase with IDE precision. Combined with AST-level structural analysis and architecture-aware code intelligence, the agent understands your code instead of just grepping it.

**Extensions**: lsp, tree_sitter, code_intel

### Smarter agent interaction

Structured questionnaires keep the agent from spinning when it needs your input. Diagnostics surface problems inline after every edit. Subdirectory context injection keeps the agent focused on the right files. Transparency tools show you exactly what's eating your context window.

**Extensions**: ask_user, claude-md, context, debug

### Everyday friction, removed

Command aliases for muscle memory (`/exit`, `/e`). Default bash timeouts so hung commands don't stall your session. A keyboard-driven prompt stash so you never lose a draft. Small fixes that add up.

**Extensions**: extras, bash-timeout

## Quick install

```bash
pi install npm:@mrclrchtr/supi
```

That's it. All production extensions, working together.

Or pick what you need:

```bash
pi install npm:@mrclrchtr/supi-lsp          # code navigation
pi install npm:@mrclrchtr/supi-tree-sitter   # AST analysis
pi install npm:@mrclrchtr/supi-ask-user      # structured decisions
pi install npm:@mrclrchtr/supi-extras        # aliases, stash, spinner
pi install npm:@mrclrchtr/supi-bash-timeout  # default timeouts
```

## Extensions

| Extension | Package |
|-----------|---------|
| **lsp** | `@mrclrchtr/supi-lsp` |
| **tree_sitter** | `@mrclrchtr/supi-tree-sitter` |
| **code_intel** | `@mrclrchtr/supi-code-intelligence` |
| **ask_user** | `@mrclrchtr/supi-ask-user` |
| **claude-md** | `@mrclrchtr/supi-claude-md` |
| **context** | `@mrclrchtr/supi-context` |
| **debug** | `@mrclrchtr/supi-debug` |
| **extras** | `@mrclrchtr/supi-extras` |
| **bash-timeout** | `@mrclrchtr/supi-bash-timeout` |
| *(core)* | `@mrclrchtr/supi-core` |

Each extension has its own README with full details, configuration, and API docs.

### Beta extensions

Not bundled in the meta-package. Install directly if you need them:

| Extension | Package |
|-----------|---------|
| **web** | `@mrclrchtr/supi-web` |
| **cache** | `@mrclrchtr/supi-cache` |
| **rtk** | `@mrclrchtr/supi-rtk` |
| **review** | `@mrclrchtr/supi-review` |
| **insights** | `@mrclrchtr/supi-insights` |

```bash
pi install npm:@mrclrchtr/supi-web
pi install npm:@mrclrchtr/supi-cache
# ...
```

## From git or local path

```bash
pi install git:github.com/mrclrchtr/supi
pi install /path/to/SuPi/packages/supi-lsp
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi.
