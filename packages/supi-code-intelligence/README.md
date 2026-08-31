<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-intelligence">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/social-preview.png" alt="SuPi Code Intelligence" width="100%">
  </a>
</div>

# @mrclrchtr/supi-code-intelligence — LSP and Tree-sitter AST Code Intelligence for Pi

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-code-intelligence)](https://www.npmjs.com/package/@mrclrchtr/supi-code-intelligence)

Gives the [Pi coding agent](https://github.com/earendil-works/pi) direct, model-callable LSP semantic navigation and Tree-sitter AST structural code analysis.

## LSP + AST, directly available to the agent

Instead of relying on file reads and text search alone, Pi can call focused `code_*` tools backed by:

- **Language servers (LSP)** for types, definitions, references, implementations, diagnostics, workspace symbols, and semantic refactoring.
- **Tree-sitter ASTs** for syntax, outlines, source structure, structural search, and outgoing calls.

The two sources complement each other without silently pretending one is the other. Results say which capability supplied the evidence and when semantic or structural analysis is unavailable.

## What your agent gets

After installation, keep asking Pi normal coding questions. The agent can:

- **Map an unfamiliar repository** — understand workspaces, packages, entry points, dependencies, and local `CLAUDE.md` or `AGENTS.md` instructions before editing.
- **Navigate precisely with LSP** — identify the exact symbol at a source location and inspect its type, definition, enclosing declaration, and nearby diagnostics.
- **Follow relationships across LSP and AST evidence** — find references, implementations, and outgoing calls without guessing from matching text.
- **Search parsed code structure** — query AST definitions, types, interfaces, classes, methods, enums, imports, exports, and call sites. One owned Structural Worker keeps Pi responsive. Tool cancellation and the shared AST deadline propagate through an atomic cancellation flag into Worker reads, parser progress, and query progress.
- **Correlate diagnostics** — each public `code_*` call gets one session-local opaque Debug Operation ID. Directly owned workflow, LSP, AST Scan, and Structural Worker events share it without changing normal Tool results.
- **Check live project health** — inspect language-server status and current errors or warnings, with an option to refresh stale diagnostics.
- **Refactor safely** — preview language-aware renames and extractions before applying them. Plans are rejected if the files changed in the meantime.
- **See uncertainty clearly** — results distinguish “nothing found” from incomplete or unavailable analysis and disclose omitted matches.

When Pi recognizes a workspace, the agent also receives a compact architecture overview near the start of the session, so it can orient before spending turns opening files. The overview contains manifest facts (module names, one-line descriptions, declared topology, declared entrypoints, and detected languages), is labeled as untrusted repository evidence, and is controlled by the `code-intelligence.overviewEnabled` setting in `/supi-settings`.

## Example requests

You do not need to learn the tool-call syntax. Try asking Pi:

- “Map this repository and explain where authentication lives.”
- “Find every use and implementation of `PaymentProvider`.”
- “What does `executeAskUser` call, and where is it referenced?”
- “Find all exported interfaces under `packages/api`.”
- “Check this project for current language-server diagnostics.”
- “Rename `oldName` to `newName`, but show me the refactor plan before applying it.”

## See it in action

Select any screenshot to open it at full resolution.

### Understand the workspace

[![Workspace orientation showing package files, manifest details, and relationships][workspace-orientation]][workspace-orientation]

### Inspect an exact symbol

[![Symbol inspection showing syntax, hover information, definition, and diagnostics][symbol-inspection]][symbol-inspection]

### Follow references and calls

[![Relationship graph showing references and direct calls][relationship-graph]][relationship-graph]

### Check live health

[![Code health showing diagnostics and running language servers][code-health]][code-health]

### Preview a safe refactor

[![Refactor plan previewing a semantic rename without changing files][refactor-plan]][refactor-plan]

## Agent tools

The package adds eight tools that Pi selects as needed:

| Tool | What it lets the agent do |
|---|---|
| `code_orientation` | Understand a workspace, package, directory, file, or symbol before reading broadly |
| `code_resolve` | Resolve an exact symbol, disambiguate matches, or list declarations in a file |
| `code_inspect` | Combine AST syntax with LSP type, definition, symbol, and diagnostic facts at one source location |
| `code_graph` | Follow LSP references and implementations plus AST calls made by a symbol |
| `code_find` | Search LSP workspace symbols or parsed AST source structure rather than raw text |
| `code_health` | Check live diagnostics, language servers, and code-intelligence availability |
| `code_refactor_plan` | Preview a precise rename, extraction, import cleanup, or dead-code deletion without changing files |
| `code_refactor_apply` | Apply a fresh refactor plan after safety checks |

Pi's built-in `grep` remains the right tool for literal or regular-expression searches; these tools add symbol and source-structure awareness.

## Install

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

To try it for one run without installing:

```bash
pi -e npm:@mrclrchtr/supi-code-intelligence
```

## Language support

Structural code search is bundled with the package. Full symbol navigation, references, diagnostics, and semantic refactoring require the matching language server on `PATH`.

The extension detects project languages and starts installed servers automatically:

| Language | Required binary |
|---|---|
| TypeScript / JavaScript | `typescript-language-server` |
| Python | `pyright-langserver` |
| Rust | `rust-analyzer` |
| Go | `gopls` |
| C / C++ | `clangd` |
| Bash | `bash-language-server` |
| HTML | `vscode-html-language-server` |
| SQL | `sql-language-server` |
| Ruby | `ruby-lsp` |
| Java | `jdtls` |
| Kotlin | `kotlin-lsp` |
| R | `R` with the `languageserver` package |

If a server is missing, the agent can still use available workspace and structural evidence. Semantic features report that they are unavailable rather than silently guessing.

## Status and settings

Open the status view to see each LSP route with its workspace-relative root, running or missing servers, typed route issue counts, and capability warnings:

```text
/supi-ci-status
```

Use `/supi-settings` to disable language servers you do not need, change the instruction filenames surfaced during directory orientation (defaults `CLAUDE.md` and `AGENTS.md`), or disable the first-turn architecture overview with `overviewEnabled`.

[workspace-orientation]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/workspace-orientation.png
[symbol-inspection]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/symbol-inspection.png
[relationship-graph]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/relationship-graph.png
[code-health]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/code-health.png
[refactor-plan]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/refactor-plan.png
