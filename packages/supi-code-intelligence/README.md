<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-intelligence">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-intelligence/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-code-intelligence

Focused code understanding, navigation, search, health, and refactoring tools for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-code-intelligence
```

For local development:

```bash
pi install ./packages/supi-code-intelligence
```

## Quickstart

The extension detects project languages and starts matching language servers. Install the required server binaries on `PATH`:

| Language | Binary |
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
| R | `R` with `languageserver` |

Check runtime status with:

```text
/supi-ci-status
```

Use `/supi-settings` to disable unneeded language servers or configure instruction filenames. The default instruction files are `CLAUDE.md` and `AGENTS.md`.

## Public tools

The extension registers exactly eight `code_*` tools:

- `code_resolve` — resolve a semantic symbol, anchored position, or file into stable session handles
- `code_inspect` — inspect exact point facts
- `code_orientation` — orient around a workspace, module, directory, file, or resolved symbol
- `code_graph` — collect references, structural callees, and implementations
- `code_find` — explicit text, regex, AST, or semantic search
- `code_health` — report diagnostics, servers, dirty files, coverage, and unused-code evidence
- `code_refactor_plan` — preview a precise semantic refactor without mutation
- `code_refactor_apply` — apply a stored plan after freshness checks

`code_impact`, `code_context`, `code_brief`, `code_references`, `code_calls`, and `code_implementations` are not compatibility aliases.

A lightweight architecture overview may be injected once near session start when a project model is available.

## Exact-one target selectors

Target-taking tools use nested, exact-one selectors. Depending on the tool, the accepted branch is one of:

```text
{ target: { handle: "tg-…" } }
{ target: { anchor: { file: "src/a.ts", line: 10, character: 5 } } }
{ target: { symbol: { query: "myFunction", scope: "src" } } }
{ target: { file: "src/a.ts" } }          # code_resolve only
```

No flat `targetId`, `file`, `line`, `character`, or `symbol` target fields are accepted. There is no precedence between contradictory inputs.

Coordinates are 1-based; `character` is a UTF-16 column.

### Handle lifecycle

Target and plan handles are:

- session-scoped
- fingerprint-checked
- stale after a touched file changes
- not persisted across sessions

A stale handle fails explicitly. Re-run `code_resolve` or `code_refactor_plan` to obtain a fresh handle.

## Common workflows

### Resolve and inspect relationships

```text
code_resolve({ target: { symbol: { query: "myFunction", scope: "packages/app" } } })
  → capture targetId

code_graph({
  target: { handle: "tg-…" },
  relations: ["references", "callees"]
})
```

Use the result's Read Next ranges with `read` before editing.

### Orient before editing

```text
code_orientation({ focus: { path: "packages/my-package" } })
code_orientation({ focus: { module: "@scope/my-package" } })
code_orientation({ focus: { target: { handle: "tg-…" } } })
```

Omit `focus` for workspace Orientation. Directory Orientation also surfaces applicable local instruction files once per session branch.

### Inspect one source point

```text
code_inspect({
  point: { file: "src/index.ts", line: 12, character: 8 },
  maxResults: 10
})
```

Point inspection may include syntax, an enclosing symbol, hover/type facts, definitions, nearby diagnostics, and code-action titles. It does not invent heuristic substitutes when every required substrate is unavailable.

### Search explicitly

```text
code_find({ query: "widget" })
code_find({ query: "widget.*", mode: "regex", scope: ["src"] })
code_find({ query: "widget", mode: "semantic" })
code_find({ query: "widget", mode: "ast", kind: "definition" })
```

Modes never silently fall back:

- omitted mode / `text` — literal text; rejects `kind`
- `regex` — ripgrep regex; rejects `kind`
- `semantic` — workspace symbols; rejects `kind`
- `ast` — structured search; requires `kind`

AST `call` finds written call-site names, not symbol identity. Use `code_graph` references on a resolved target for symbol-identity relationships.

### Check health

```text
code_health({ refresh: true, include: ["diagnostics", "servers", "dirty"] })
code_health({ include: ["coverage", "unused"] })
```

Coverage defaults to `coverage/coverage-summary.json`; unused-code evidence defaults to `knip.json`. Missing reports are disclosed.

### Plan and apply a rename

```text
code_refactor_plan({
  target: { handle: "tg-…" },
  operation: { rename_symbol: { newName: "newName" } }
})
  → review edits and capture planId

code_refactor_apply({ planId: "plan-…" })
```

Extract operations use the same exact-one operation shape:

```text
operation: {
  extract_function: {
    newName: "computeValue",
    range: {
      start: { line: 10, character: 3 },
      end: { line: 12, character: 20 }
    }
  }
}
```

Planning never writes files. Application is the sole mutator, acquires sorted per-file mutation queues, revalidates fingerprints and edit safety, and rolls back earlier writes if a later write fails.

## Graph evidence

`code_graph.relations` accepts only:

- `references` — semantic, symbol-identity evidence
- `callees` — structural outgoing calls as written in source
- `implements` — semantic implementation evidence
- `all` — exactly the three relations above and must be the only list item

`calleeDepth: "direct"` excludes nested function/method/callback scopes; `"deep"` includes them. Structural callees are not callers and are not symbol-identity relationships.

Imports, exports, and tests remain available as explicit AST search kinds in `code_find`; they are not graph relation families.

## Honest correctness

- Semantic, structural, and text evidence retain their provenance.
- Required capability failures are explicit; tools do not silently switch substrates.
- `maxResults` is a display cap. Results disclose shown, total, and omitted evidence when known.
- A deterministic convention may locate an artifact, but cannot prove a classification, relationship, or absence claim.
- Zero matches are successful searches, not tool failures.

## Startup and settings

Detected language servers start concurrently. In polyglot workspaces, disable unneeded servers in `.pi/supi/config.json` or `~/.pi/agent/supi/config.json`:

```json
{
  "lsp": {
    "servers": {
      "python": { "enabled": false },
      "rust": { "enabled": false }
    }
  }
}
```

The old global `lsp.enabled` and `lsp.active` keys are deprecated and ignored. Missing binaries, disabled languages, and structural startup failures appear in `/supi-ci-status` and `code_health`.

## Architecture

- `supi-code-intelligence` owns the Workspace code-intelligence session, workflow policy, Tool result assembly, and public tool family.
- `supi-code-runtime` owns canonical provider contracts and workspace capability state.
- `supi-lsp` owns semantic lifecycle and the Workspace LSP runtime.
- `supi-tree-sitter` owns structural parser reuse.

Markdown and TUI are adapters over assembled typed results. Providers, clients, mutable targets, and the LSP manager do not cross the workflow seam.

See:

- [`docs/adr/0015-workspace-session-and-tool-result-assembly.md`](../../docs/adr/0015-workspace-session-and-tool-result-assembly.md)
- [`docs/adr/0016-workspace-lsp-runtime-interface.md`](../../docs/adr/0016-workspace-lsp-runtime-interface.md)
- [`docs/adr/0017-focused-code-tools-and-evidence-policy.md`](../../docs/adr/0017-focused-code-tools-and-evidence-policy.md)
- [`docs/adr/0002-refactor-planner-applier-split.md`](../../docs/adr/0002-refactor-planner-applier-split.md)

## Package exports

- `@mrclrchtr/supi-code-intelligence/api` — reusable type contracts
- `@mrclrchtr/supi-code-intelligence/extension` — PI extension entrypoint
