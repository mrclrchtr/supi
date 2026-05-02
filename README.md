# SuPi

**Super Pi**

*The opinionated way to extend PI.*

SuPi is an opinionated extension monorepo for PI with LSP, Skills, marketplace compatibility, and personal best practices built in.

- SuPi is my curated extension stack for PI.
- SuPi makes PI extensible, interoperable, and sane by default.
- Install the full stack or pick individual extensions.

Built for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Extensions

| Package | Extension | Description |
|---------|-----------|-------------|
| `@mrclrchtr/supi-aliases` | **aliases** | Registers `/exit` to quit pi, `/e` as a shorthand alias, and `/clear` to start a new session (alias for `/new`) |
| `@mrclrchtr/supi-bash-timeout` | **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via `PI_BASH_DEFAULT_TIMEOUT` (seconds, default 120). |
| `@mrclrchtr/supi-skill-shortcut` | **skill-shortcut** | Type `$skill-name` as a shorthand for `/skill:skill-name`. Autocomplete triggers on `$`. |
| `@mrclrchtr/supi-ask-user` | **ask-user** | Rich questionnaire UI for structured agent–user decisions. |
| `@mrclrchtr/supi-lsp` | **lsp** | Adds Language Server Protocol support for hover, definitions, references, symbols, rename, code actions, workspace symbol search, and diagnostics. It appends inline diagnostics after `write`/`edit`, advertises semantic-first tool guidance, and injects stateful pre-turn guidance that activates only after the session touches a supported source file. Also exports a reusable `SessionLspService` library surface for peer extensions. |
| `@mrclrchtr/supi-tree-sitter` | **tree_sitter** | Adds structural Tree-sitter analysis for JavaScript and TypeScript files: outline, imports, exports, node-at-position lookup, and custom queries. Designed as a standalone substrate independent of semantic LSP tooling. |
| `@mrclrchtr/supi-review` | **review** | Adds `/supi-review` for structured code review with configurable fast/deep models, diff limits, and review timeout via `/supi-settings`. |

## Install

### Full stack (meta-package)

```bash
pi install npm:@mrclrchtr/supi
```

### Individual extensions

```bash
pi install npm:@mrclrchtr/supi-lsp
pi install npm:@mrclrchtr/supi-tree-sitter
pi install npm:@mrclrchtr/supi-ask-user
pi install npm:@mrclrchtr/supi-skill-shortcut
pi install npm:@mrclrchtr/supi-bash-timeout
pi install npm:@mrclrchtr/supi-aliases
pi install npm:@mrclrchtr/supi-review
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

The `tree_sitter` extension provides syntax-tree-level structural analysis for JavaScript and TypeScript files:

- supports `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs`
- exposes actions for `outline`, `imports`, `exports`, `node_at`, and `query`
- uses 1-based `line`/`character` coordinates; `character` is a UTF-16 code-unit column
- caps tool responses at 100 emitted items, including nested outline children
- exports `createTreeSitterSession(cwd)` for other SuPi packages that need reusable parse/query/structure services
- remains correct and self-contained when installed without `supi-lsp`

## Review extension

The `review` extension adds structured code review through `/supi-review`.

- runs reviews in a dedicated read-only subprocess
- supports interactive target/depth selection plus non-interactive `/supi-review ...` arguments
- stores fast/deep model overrides, diff size limit, and review timeout in minutes in `/supi-settings`
- preserves child review sessions for timeout/failure debugging

## LSP extension

The `lsp` extension adds semantic code navigation and diagnostics:

- exposes a single `lsp` tool with actions for hover, definition, references, diagnostics, symbols, rename, code_actions, workspace_symbol, search, and symbol_hover
- appends LSP diagnostics after `write`/`edit`
- performs a proactive project scan at `session_start` to detect matching roots and available language servers, then eagerly starts them
- builds project-specific semantic-first `promptSnippet` / `promptGuidelines` from detected servers, roots, file types, and supported actions so the agent prefers `lsp` for code navigation and diagnostics
- injects compact XML-framed diagnostic context only when outstanding diagnostics exist, deduped across turns so unchanged diagnostics do not re-inject
- provides `/lsp-status` for server roots, capabilities, open files, and diagnostics
- exports a public `SessionLspService` library surface from the package root so peer extensions can reuse the active LSP runtime without starting duplicate servers

Configuration:

- Settings are managed through `/supi-settings` (LSP panel)
- `.pi-lsp.json` in the project root — override/add/disable server definitions
