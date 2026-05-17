# SuPi

**Super Pi**

*My curated extension stack for PI — shared in case they help you too.*

SuPi is my personal collection of extensions for PI: LSP, code intelligence, structural analysis, and practical utilities. Built for my own workflow and shared freely.

- SuPi is my curated extension stack for PI.
- SuPi makes PI extensible, interoperable, and sane by default.
- Install the full stack or pick individual extensions.

Built for the [pi coding agent](https://github.com/earendil-works/pi).

## Extensions

| Package | Extension | Description |
|---------|-----------|-------------|
| `@mrclrchtr/supi-extras` | **extras** | Command aliases (`/exit`, `/e`, `/clear`), `$skill-name` shorthand, tab spinner, `/supi-stash` prompt stash with TUI overlay, and other small utilities |
| `@mrclrchtr/supi-bash-timeout` | **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via SuPi config or `/supi-settings` (default 120s). |
| `@mrclrchtr/supi-ask-user` | **ask-user** | Rich questionnaire UI for structured agent–user decisions. |
| `@mrclrchtr/supi-claude-md` | **claude-md** | Automatic subdirectory CLAUDE.md/AGENTS.md injection and context management skills. |
| `@mrclrchtr/supi-context` | **context** | Context-usage report via `/supi-context` — breaks down system prompt, conversation, tools, and extension overhead. |
| `@mrclrchtr/supi-debug` | **debug** | Session-local debug event inspection with agent-callable `supi_debug` tool and `/supi-debug` command. |
| `@mrclrchtr/supi-code-intelligence` | **code-intelligence** | Agent-facing `code_intel` tool — architecture briefs, callers/callees, impact analysis, pattern search, project indexing. |
| `@mrclrchtr/supi-lsp` | **lsp** | Language Server Protocol — hover, definitions, diagnostics, symbols, rename, code actions, workspace search. |
| `@mrclrchtr/supi-tree-sitter` | **tree_sitter** | Structural AST analysis across 14+ grammars — outline, imports, exports, node_at, query. |
| `@mrclrchtr/supi-core` | **core** | Shared infrastructure — config, settings registry, XML context tags, project-root helpers. Not a standalone pi extension. |

### 🧪 Beta (direct-install only)

| Package | Extension | Description |
|---------|-----------|-------------|
| `@mrclrchtr/supi-cache` | **cache** | Prompt cache health monitoring and cross-session forensics with four query patterns. |
| `@mrclrchtr/supi-insights` | **insights** | Historical session insights — rich HTML reports analyzing usage, friction, and suggestions. |
| `@mrclrchtr/supi-review` | **review** | Structured code review via `/supi-review` with configurable reviewer models. |
| `@mrclrchtr/supi-rtk` | **rtk** | Transparent RTK-backed bash rewriting for token savings on repetitive commands. |
| `@mrclrchtr/supi-web` | **web** | Fetch web pages as clean Markdown and query library documentation via Context7 (`web_fetch_md`, `web_docs_search`, `web_docs_fetch`). |

## Installing

### Full stack (meta-package)

```bash
pi install npm:@mrclrchtr/supi
```

### Production extensions

```bash
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-tree-sitter
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-extras
pi install npm:@mrclrchtr/supi-bash-timeout
```

### Beta extensions (direct install only)

```bash
pi install npm:@mrclrchtr/supi-cache
pi install npm:@mrclrchtr/supi-insights
pi install npm:@mrclrchtr/supi-review
pi install npm:@mrclrchtr/supi-rtk
pi install npm:@mrclrchtr/supi-web
```

### From git or local path

```bash
# Full stack from git
pi install git:github.com/mrclrchtr/supi

# Individual extension from local checkout
pi install /path/to/SuPi/packages/supi-lsp
pi install /path/to/SuPi/packages/supi-tree-sitter
pi install /path/to/SuPi/packages/supi-ask-user
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi to pick up extension changes.

## Tree-sitter extension

The `tree_sitter` extension provides syntax-tree-level structural analysis across supported grammars:

- supports JavaScript/TypeScript, Python, Rust, Go, C/C++, Java, Kotlin, Ruby, Bash/Shell, HTML, R, and SQL file families
- exposes actions for `outline`, `imports`, `exports`, `node_at`, and `query`
- `outline`, `imports`, and `exports` are currently JavaScript/TypeScript-only; `node_at` and `query` work across all supported grammars
- uses 1-based `line`/`character` coordinates; `character` is a UTF-16 code-unit column
- caps tool responses at 100 emitted items, including nested outline children
- exports `createTreeSitterSession(cwd)` for other SuPi packages that need reusable parse/query/structure services
- remains correct and self-contained when installed without `supi-lsp`

## Extras extension

The `extras` extension adds small quality-of-life utilities:

- **`/supi-stash`** — keyboard-driven TUI overlay for managing stashed prompt drafts. Stashes persist to `~/.pi/agent/supi/prompt-stash.json` across pi restarts.
  - `Alt+S` — stash current editor text
  - `Alt+C` — copy editor text to system clipboard
  - In the overlay: `↑↓` navigate, `Enter` restore, `c` copy, `d` delete (refreshes list in-place), `D` clear all, `Esc` cancel
- **Command aliases** — `/exit`, `/e`, `/clear`
- **`$skill-name` shorthand** — quick skill invocation
- **Tab spinner** — visual working indicator on the session tab

## LSP extension

The `lsp` extension adds semantic code navigation and diagnostics:

- exposes a single `lsp` tool with actions for hover, definition, references, diagnostics, symbols, rename, code_actions, workspace_symbol, search, symbol_hover, and recover
- appends LSP diagnostics after `write`/`edit`
- performs a proactive project scan at `session_start` to detect matching roots and available language servers, then eagerly starts them
- builds project-specific semantic-first `promptSnippet` / `promptGuidelines` from detected servers, roots, file types, and supported actions so the agent prefers `lsp` for code navigation and diagnostics
- injects compact XML-framed diagnostic context only when outstanding diagnostics exist, deduped across turns so unchanged diagnostics do not re-inject
- provides `/lsp-status` for server roots, capabilities, open files, and diagnostics
- exports a public `SessionLspService` library surface from the package root so peer extensions can reuse the active LSP runtime without starting duplicate servers

Configuration:

- Settings are managed through `/supi-settings` (LSP panel)
- SuPi config (`~/.pi/agent/supi/config.json` or `.pi/supi/config.json`) under `lsp.servers` — override/add/disable server definitions
