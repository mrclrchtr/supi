![SuPi — extensions for the Pi coding agent](assets/social-preview.png)

# SuPi — Extension Stack for the Pi Coding Agent

SuPi (short for **Super Pi**) is an open-source TypeScript extension stack for the [Pi coding agent](https://github.com/earendil-works/pi). It adds LSP and Tree-sitter code intelligence, semantic refactoring, parallel code review, web and Context7 documentation access, structured ask-user forms, and context/cache observability.

Install the recommended stack or pick only the packages you need. You keep prompting Pi normally; SuPi gives the agent additional tools and context it can use directly.

> SuPi is pre-release. Packages marked beta are the fastest-moving parts of the stack.

## The key difference: LSP + AST for the agent

Most coding agents can read files and search text. [`@mrclrchtr/supi-code-intelligence`](packages/supi-code-intelligence/README.md) gives Pi direct, model-callable access to two complementary sources of code intelligence:

- **Language servers (LSP)** provide types, definitions, references, implementations, diagnostics, workspace symbols, and semantic refactoring.
- **Tree-sitter ASTs** provide syntax, outlines, source structure, structural search, and outgoing calls.

The agent receives focused `code_*` tools for workspace orientation, precise symbol inspection, relationship analysis, code-aware search, live health, and safe refactor previews. Results disclose their evidence and say when semantic or structural analysis is unavailable instead of silently guessing.

Tree-sitter support is bundled. Full LSP features require the matching language-server binary on `PATH`; see the [Code Intelligence setup and screenshots](packages/supi-code-intelligence/README.md#language-support).

[![Code Intelligence showing LSP references and AST calls][code-intelligence]][code-intelligence]

[See all Code Intelligence screenshots →](packages/supi-code-intelligence/README.md#see-it-in-action)

## What else your agent gets

- **Web access built for agents** — [`supi-web`](packages/supi-web/README.md) prefers source Markdown, extracts readable content from public HTML, fences plain-text files, and moves long pages to temporary files instead of flooding the context window.
- **Focused library docs** — search Context7 for the right project and version, then retrieve documentation narrowed to the current task.
- **Structured decisions** — ask you focused choice or text questions through a keyboard-driven form with [`supi-ask-user`](packages/supi-ask-user/README.md).
- **Review workflows** — run independent, inspection-only reviews over a working tree, branch comparison, or commit with [`supi-review`](packages/supi-review/README.md).
- **Operational awareness** — inspect context pressure, prompt-cache health, and SuPi debug events with `supi-context`, `supi-cache`, and `supi-debug`.
- **Repository guidance** — maintain `CLAUDE.md` and `AGENTS.md` files with the skills in [`supi-claude-md`](packages/supi-claude-md/README.md).
- **Session polish** — prompt stashing, shortcuts, activity indicators, advisory prompt suggestions, and default shell timeouts.

## Install

After any installation, run `/reload` or restart Pi.

### Recommended release stack

Global installation:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install.sh | bash
```

Project-local installation into `.pi/settings.json`:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install.sh | bash -s -- -l
```

### Release stack plus beta packages

Global installation:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install-all.sh | bash
```

Project-local installation into `.pi/settings.json`:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/install-all.sh | bash -s -- -l
```

> Pi extensions run with your user permissions. Review [`install.sh`](scripts/install.sh) or [`install-all.sh`](scripts/install-all.sh) before piping either script to a shell.

### One package

Every extension package is independently installable:

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

```bash
pi install npm:@mrclrchtr/supi-web
```

## Package catalog

### Release stack

| Package | What it adds |
|---|---|
| [`supi-code-intelligence`](packages/supi-code-intelligence/README.md) | Direct LSP- and AST-backed code understanding, navigation, search, health, and refactoring tools |
| [`supi-web`](packages/supi-web/README.md) | Direct public-page-to-Markdown fetching, context-safe large output, and focused Context7 documentation |
| [`supi-ask-user`](packages/supi-ask-user/README.md) | Structured questionnaires for focused agent-user decisions |
| [`supi-context`](packages/supi-context/README.md) | Context-pressure snapshots and detailed TUI usage reports |
| [`supi-settings`](packages/supi-settings/README.md) | One project/global settings UI for SuPi packages |
| [`supi-extras`](packages/supi-extras/README.md) | Prompt stash, shortcuts, activity indicators, and other session conveniences |
| [`supi-prompt-suggestions`](packages/supi-prompt-suggestions/README.md) | Advisory ghost-text suggestions from a model you choose |

### DevTools

Not part of the recommended release stack. Included in the full-stack installer (`install-all.sh`), or install separately:

| Package | What it adds |
|---|---|
| [`supi-debug`](packages/supi-debug/README.md) | Shared debug-event capture and bounded troubleshooting tools |

```bash
pi install npm:@mrclrchtr/supi-debug
```

### Beta additions

Installed by `install-all.sh` on top of the release stack:

| Package | What it adds |
|---|---|
| [`supi-review`](packages/supi-review/README.md) | Caller-defined, inspection-only reviews in managed child sessions |
| [`supi-cache`](packages/supi-cache/README.md) | Prompt-cache monitoring and cross-session regression forensics |
| [`supi-insights`](packages/supi-insights/README.md) | Historical session analytics and shareable HTML reports |
| [`supi-claude-md`](packages/supi-claude-md/README.md) | Skills for auditing and revising repository instruction files |
| [`supi-bash-timeout`](packages/supi-bash-timeout/README.md) | Default timeouts so forgotten shell limits do not stall the session |

### Internal libraries

These packages power the stack and are not standalone Pi extensions:

- [`supi-lsp`](packages/supi-lsp/README.md) — Language Server Protocol runtime bundled by Code Intelligence.
- [`supi-tree-sitter`](packages/supi-tree-sitter/README.md) — structural AST analysis bundled by Code Intelligence.
- [`supi-code-runtime`](packages/supi-code-runtime/README.md) — shared code-intelligence contracts and workspace capability state.
- [`supi-core`](packages/supi-core/README.md) — common configuration, settings, reporting, and session infrastructure.
- [`supi-test-utils`](packages/supi-test-utils/README.md) — shared test helpers for SuPi packages.

## Configure

The release stack includes [`supi-settings`](packages/supi-settings/README.md). Open the shared settings UI with:

```text
/supi-settings
```

Press Tab to switch between project and global scope. Settings show whether each value comes from the project, global configuration, or its default.

If you install packages individually and want this UI, install it separately:

```bash
pi install npm:@mrclrchtr/supi-settings
```

## Update and remove

Update installed Pi packages:

```bash
pi update --extensions
```

Remove the release stack:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/uninstall.sh | bash
```

Remove the release-plus-beta stack:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/uninstall-all.sh | bash
```

For project-local removal, add `-s -- -l` to either command:

```bash
curl -fsSL https://raw.githubusercontent.com/mrclrchtr/supi/main/scripts/uninstall.sh | bash -s -- -l
```

Remove one package:

```bash
pi uninstall npm:@mrclrchtr/supi-web
```

Run `/reload` or restart Pi after removing extensions.

## License

[MIT](LICENSE)

[code-intelligence]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/relationship-graph.png
