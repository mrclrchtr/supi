<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-intelligence">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/social-preview.png" alt="SuPi Code Intelligence" width="100%">
  </a>
</div>

# @mrclrchtr/supi-code-intelligence

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-code-intelligence)](https://www.npmjs.com/package/@mrclrchtr/supi-code-intelligence)

A [Pi coding agent](https://github.com/earendil-works/pi) extension to navigate symbols, search code structure, check diagnostics, and preview and apply semantic refactors.

## Install

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

Add `-l` for a project-local install. To try the package for one run:

```bash
pi -e npm:@mrclrchtr/supi-code-intelligence
```

For local development, run `pi install ./packages/supi-code-intelligence` from the SuPi repository root. Run `/reload` after changes.

This package is included in the SuPi release installer. SuPi remains pre-release. The package bundles its LSP and Tree-sitter runtime dependencies, but not language-server binaries.

## What it adds

- **Language Server Protocol (LSP) tools** for types, definitions, references, implementations, diagnostics, workspace symbols, and semantic refactoring.
- **Tree-sitter tools** for syntax, declarations, structural search, and calls as written in source code. These calls are not a semantic call graph.
- **Workspace orientation** from files, manifests, and declared package relationships. Directory orientation can also show local instruction files.
- **Visible evidence limits** that distinguish no matches from incomplete or unavailable analysis. Search modes do not silently switch to each other or to text search.
- **An optional first-turn overview** with discovered modules, manifest descriptions, declared entrypoints, dependencies, and detected languages. It is enabled by default and labeled as untrusted repository evidence, not instructions.

The overview is a hidden Pi message, not a live architecture graph. It is not repeated when the active session branch already contains it. All discovered modules are included: 1,000 estimated tokens is a warning threshold, not a size cap.

## Usage

Ask Pi normal coding questions. For example:

- “Map this repository and find the authentication package.”
- “Find references and implementations of `PaymentProvider`.”
- “Show the calls written inside `executeAskUser`.”
- “Find interface declarations under `packages/api`.”
- “Refresh the language-server diagnostics for this file.”
- “Preview a rename from `oldName` to `newName`. Do not apply it yet.”

### Agent tools

The full extension registers all eight tools at startup; it does not load them on demand.

| Tool | Purpose |
|---|---|
| `code_orientation` | Show workspace facts, or focus on a path, module, or symbol target |
| `code_resolve` | Resolve a real symbol anchor or semantic query to target handles, or list a file's declarations |
| `code_inspect` | Inspect syntax, the enclosing declaration, hover information, definitions, and nearby diagnostics at one point |
| `code_graph` | Find semantic references and implementations, or structural calls from the enclosing scope |
| `code_find` | Search with an explicit `ast` or `semantic` mode |
| `code_health` | Report diagnostic observations and language-server health |
| `code_refactor_plan` | Store a semantic refactor preview without changing files |
| `code_refactor_apply` | Apply a fresh stored plan after file and edit checks |

Use Pi's `grep` for literal or regular-expression search. Source points use 1-based lines and 1-based UTF-16 columns. A target or focus selector must contain exactly one choice.

Example tool calls:

```javascript
code_orientation({ focus: { path: "packages/api" } })
code_find({ query: "PaymentProvider", mode: "semantic", scope: ["packages/api"] })
code_health({ scope: "packages/api/src/index.ts", refresh: true })
```

Important tool rules:

- **Resolve:** new target handles require semantic readiness. A comment or whitespace point is not a symbol; use `code_inspect` there. Handles are session-local and become stale when file contents change. Resolve the symbol again rather than reuse a stale handle.
- **Graph:** relations are `references` (default), `callees`, and `implements`. Use `["all"]` for all three. Callee depth is `direct` by default; `deep` includes nested scopes. Callees match source shape, not symbol identity.
- **Find:** AST mode requires `kind`: `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, or `enum`. Semantic mode does not accept `kind`. A supplied `scope` is a non-empty array.
- **Health:** `include` accepts `diagnostics` and `servers` (both by default); `level` is `summary` (default) or `detailed`. Server inventory and route counts remain workspace-wide, even with a diagnostic scope. A diagnostic snapshot does not prove that the whole workspace is clean.

`code_health({ refresh: true })` retries failed startup and exhausted process-crash routes in scope, with at most one attempt per route per call. It collects fresh diagnostic evidence and reports recovery separately from diagnostic confirmation. A later refresh can retry a failed route. Reports show up to 16 route entries per recovery list and disclose omitted entries. Use an exact file scope when a route reports `use-exact-file`.

### Refactor checks

The planner accepts one target handle or anchor and one operation: `rename_symbol`, `extract_function`, `extract_variable`, `update_imports`, or `delete_dead_code`. Availability depends on the language server. Unsupported operations do not fall back to text edits.

Plans are held in memory for the current session. Apply accepts only the returned `planId`; it does not create or regenerate a plan. It checks SHA-256 file fingerprints, provider-authorized roots, document versions when available, edit ranges, and overlaps before writing. Changed files require a new plan. A successful apply removes the plan.

Refactors can change several files. If a later write fails, the tool attempts to restore earlier files and reports restoration failures. It does not create a Git commit. The plan/apply split is not a user confirmation dialog: the agent can call apply. Review the diff and run tests.

## Language support

Install the required language servers yourself. The extension detects project languages and starts available configured commands on `PATH` in trusted projects. It does not download or install servers. Individual semantic features depend on server support and readiness.

Tree-sitter grammars are bundled and parse locally. Grammar selection uses the file extension, not a shebang.

| Language | Default LSP binary | Tree-sitter file extensions |
|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `pyright-langserver` | `.py`, `.pyi` |
| Rust | `rust-analyzer` | `.rs` |
| Go | `gopls` | `.go` |
| C / C++ | `clangd` | `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx`, `.hxx`, `.c++`, `.h++` |
| Bash | `bash-language-server` | `.sh`, `.bash`, `.zsh`, `.ksh` (Bash grammar) |
| HTML | `vscode-html-language-server` | `.html`, `.htm`, `.xhtml` |
| SQL | `sql-language-server` | `.sql` |
| Ruby | `ruby-lsp` | `.rb`, `.gemspec` |
| Java | `jdtls` | `.java` |
| Kotlin | `kotlin-lsp` | `.kt`, `.kts` |
| R | `R` with the `languageserver` package | `.r` |

Operation support is narrower than grammar support. AST import and export search supports only JavaScript, TypeScript, and TSX. Other AST operations depend on the grammar's extractors. A missing LSP server does not prevent available workspace or structural queries, but it prevents new semantic targets and related operations.

### Search and output limits

- An AST search has a 5,000 eligible-file limit and a 10-second deadline shared by file enumeration and analysis. These are not tool-call settings.
- Below directory roots, AST search excludes hidden entries, dependency/build/cache directories, symlinks, non-regular files, and files unsupported by the requested operation. It does **not** read `.gitignore`. Explicit roots are resolved and honored, including symlink roots. See the [scan policy](src/analysis/search/ast-scan.ts) for the exact directory list.
- An exact file that does not support the requested AST operation is invalid. Results disclose policy exclusions, interrupted scans, provider limits, and omitted matches. No matches do not mean that unsupported files were searched.
- Tool text is truncated at Pi's default 2,000 lines or 50 KB. When this occurs, the full text is written to a temporary file and its path is returned. Result-list limits still apply to that full text.

## Status and settings

In interactive Pi, open the status overlay:

```text
/supi-ci-status
```

It shows server routes and roots, missing or running servers, diagnostics, and capability warnings. The terminal must be at least 60 columns wide. Use Up/Down to select a diagnostic file, Enter or Space to expand it, `r` to reload the displayed snapshot, `a` to collapse it, and Escape to close. The extension also adds LSP status to the footer. Use `code_health` for health reports outside the interactive terminal.

The package registers **Code Intelligence** and **LSP** settings. If `@mrclrchtr/supi-settings` is installed, use `/supi-settings` to edit them. A standalone Code Intelligence install does not include that settings UI.

Configuration files:

- Global: `~/.pi/agent/supi/config.json`
- Project: `.pi/supi/config.json`

Project values override global values, which override defaults. Project configuration and instruction discovery require project trust. For an untrusted project, the overview setting uses global values and defaults only; no LSP controller is started for that session.

| Setting | Default | Effect |
|---|---|---|
| `code-intelligence.overviewEnabled` | `true` | Add the hidden overview; the choice is fixed for the session |
| `code-intelligence.instructionFileNames` | `["CLAUDE.md", "AGENTS.md"]` | Ordered plain filenames for directory instruction discovery |
| `lsp.exclude` | `[]` | Gitignore-style patterns for automatic LSP work, not exact-file requests |
| `lsp.servers.<language>.enabled` | Enabled unless `false` | Disable a language server |

Example `.pi/supi/config.json`:

```json
{
  "code-intelligence": {
    "overviewEnabled": false,
    "instructionFileNames": ["AGENTS.md", "CLAUDE.md"]
  },
  "lsp": {
    "exclude": ["generated/**"],
    "servers": {
      "python": { "enabled": false }
    }
  }
}
```

Use `typescript`, `python`, `rust`, `go`, `c`, `ruby`, `java`, `kotlin`, `bash`, `html`, `sql`, or `r` for built-in server keys (`cpp` aliases `c`). Server command and routing overrides are defined in the [LSP configuration reference](../supi-lsp/README.md#custom-server-configuration). `.pi-lsp.json` is not read. Restart Pi after server configuration changes. Only the boolean `true` enables the overview; non-boolean values do not enable it.

Directory orientation checks the path from the workspace root to the focused directory. It selects the first valid configured instruction file per directory, skips files already loaded by Pi or shown on the active branch, and shows at most 200 lines per file. Resolved instruction paths must stay inside the workspace. These snippets are tool output, not additions to Pi's system prompt.

## Privacy and security

Pi extensions run with your system permissions; this package is not a sandbox. Language servers run as local processes and receive source files. Review server commands and project configuration before trusting a project. `lsp.exclude` and AST scan exclusions are not access controls.

Tool results and the hidden overview enter Pi's model context and can be saved in session history. They can contain source text, paths, manifest data, diagnostics, and instruction-file contents. Truncated tool results also leave full text in local temporary files. “Hidden” means not displayed in the transcript, not hidden from the model.

## Public entrypoints

| Export | Surface |
|---|---|
| `@mrclrchtr/supi-code-intelligence/api` | Type-only provider contracts, architecture models, targets, health observations, and tool results; no runtime functions |
| `@mrclrchtr/supi-code-intelligence/extension` | Default full Pi extension factory |
| `@mrclrchtr/supi-code-intelligence/headless` | Default inspection-only extension factory and `HEADLESS_INSPECTION_TOOL_NAMES` |
| `@mrclrchtr/supi-code-intelligence/package.json` | Package manifest |

The package-root export also re-exports types; prefer `/api`. See [the type exports](src/api.ts) for the complete list.

The headless factory registers only `code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, and `code_health` for managed child sessions. It adds no refactor tools, settings, commands, UI, or overview. It is a tool profile, not a filesystem sandbox.

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

### Preview a refactor

[![Refactor plan previewing a semantic rename without changing files][refactor-plan]][refactor-plan]

[workspace-orientation]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/workspace-orientation.png
[symbol-inspection]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/symbol-inspection.png
[relationship-graph]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/relationship-graph.png
[code-health]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/code-health.png
[refactor-plan]: https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/refactor-plan.png
