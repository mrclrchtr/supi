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

- `code_resolve` — resolve an anchored/symbol target or discover a file’s declarations as stable session handles
- `code_inspect` — inspect exact point facts
- `code_orientation` — orient around a workspace, module, directory, file, or resolved symbol
- `code_graph` — collect references, structural callees, and implementations
- `code_find` — explicit AST structural or semantic workspace-symbol search
- `code_health` — report live diagnostics, server status, and supplemental Capability Warnings
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

Coordinates are 1-based; `character` is a UTF-16 column. Establishing or refining a target requires ready semantic capability. Tree-sitter may supplement LSP evidence after readiness, but cannot create targets in a structural-only workspace.

`symbolKind` is an optional exact filter over the 26 provider-reported LSP `SymbolKind` values exposed by the tool schema. It is not a source-language classifier: for example, LSP has no `TypeAlias` kind and TypeScript may report a type alias as `Variable`. Omit the filter when the provider category is uncertain. If a symbol query reports candidates but none has the requested kind, the result returns a bounded Symbol-kind mismatch with observed candidate kinds and handles rather than claiming the symbol was not found or silently promoting a mismatch.

A file selector enumerates all provider-reported declarations, including nested declarations, then returns a bounded Target group with exact total/omitted metadata. Only visible members are materialized as handles. Provider-proven top-level declarations are presented first; nested declarations and declarations with unknown hierarchy remain source-ordered after that tier. Hierarchy comes only from LSP `DocumentSymbol` structure or structural outline ancestry. Every flat `SymbolInformation` observation remains explicitly unknown—even when it reports `containerName`; that value remains container metadata only. Unknown observations are never promoted without known hierarchy evidence and produce an exact unknown-hierarchy disclosure. Semantic and structural declarations are matched through canonical declaration identity; semantic facts win duplicates while each member retains a typed, monotonic set of contributing provider families. Exact Tree-sitter evidence at a declaration's name anchor can refine an underspecified identity kind—for example, reconciling a TypeScript LSP `Variable` with the same structural `type` alias—without changing the displayed or filterable provider kind. Separate type/value namespace declarations remain distinct. The group separately reports successful discovery providers. Its aggregate confidence is conservative across the complete group—semantic only when every member is semantic—while an empty group derives confidence from its strongest successful enumerator. Declaration line/occurrence keeps overload handles distinct without tying identity to the preferred display anchor. The group itself is not a handle; choose one member handle for precise graph or refactor work. A file with no declarations returns a successful empty group.

### Handle lifecycle

Target and plan handles are:

- session-scoped
- fingerprint-checked
- stale after a touched file changes
- not persisted across sessions

A stale handle fails explicitly. Re-run `code_resolve` or `code_refactor_plan` to obtain a fresh handle. A fresh existing handle remains usable for structural consumers if LSP later becomes unavailable; mixed tools suppress unavailable semantic/diagnostic sections, and semantic consumers still require a concrete live client.

## Common workflows

### Discover targets in a known file

```text
code_resolve({ target: { file: "src/billing.ts" }, maxResults: 10 })
  → choose one member targetId from the returned Target group
```

Use `code_orientation({ focus: { path: "src/billing.ts" } })` instead when you want file context rather than reusable symbol handles.

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

Omit `focus` for workspace Orientation. Directory Orientation also surfaces applicable local instruction files once per session branch. On-demand Orientation reports direct filesystem entries, successfully parsed manifest/workspace fields, and explicit provider observations. Package topology is manifest-declared—not a complete runtime architecture graph—and unavailable metadata is shown as its own warning instead of an absence claim. Workspace discovery supports `package.json#workspaces` and `pnpm-workspace.yaml#packages` with literal paths, `*`, `**`, and trailing exclusions; unsupported patterns fail closed.

### Inspect one source point

```text
code_inspect({
  point: { file: "src/index.ts", line: 12, character: 8 },
  maxResults: 10
})
```

Point inspection validates a readable regular file and an in-bounds 1-based UTF-16 point before provider work. It reports syntax, the narrowest provider-reported enclosing declaration, hover/type facts, definitions, and diagnostics whose ranges intersect the point line ±2. Every section distinguishes completed-empty, partial, and unavailable collection; diagnostics are never substituted from elsewhere in the file. Relationship guidance is emitted only from an evidence-backed definition location: resolve that definition first, then use its handle with `code_graph`. Structural-only inspection does not recommend a fresh graph anchor that LSP-first target establishment would reject.

### Search code-aware evidence

```text
code_find({ query: "widget", mode: "semantic" })
code_find({ query: "widget", mode: "ast", kind: "definition" })
code_find({ query: "@scope/package", mode: "ast", kind: "import", scope: ["src"] })
```

`mode` is required and never silently falls back:

- `semantic` — workspace symbols; rejects `kind`
- `ast` — structured source-shape search; requires `kind`

Use PI's `grep` tool for literal or regex source search when it is active. `code_find` does not redirect removed text/regex calls to another tool.

AST `kind` accepts exactly `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, and `enum`. AST `call` finds written call-site names, not symbol identity. Use `code_graph` references on a resolved target for symbol-identity relationships.

#### AST Scan universe

With omitted `scope`, AST mode scans from the workspace cwd. Eligibility is operation-aware: `definition`, `type`, `interface`, `class`, `method`, and `enum` use outline support; `import` and `export` use their matching extractors; `call` uses call-site support. A grammar being parseable does not imply that every operation supports it. Below each scan root the policy excludes operation-ineligible files, hidden entries, and `.git`, `.pnpm`, `node_modules`, `dist`, `build`, `out`, `.next`, `.nuxt`, `coverage`, `.turbo`, `.cache`, and `__pycache__`. Descendant symlinks are not followed. `.gitignore`, `.ignore`, `.rgignore`, and global Git configuration are not consulted, so visible Git-ignored source remains eligible when the selected operation supports it.

Every explicit scope root is honored before descendant exclusions resume. An operation-eligible source file explicitly selected under `node_modules`, for example, is analyzed. An exact file whose grammar does not support the selected operation is invalid rather than redirected; a directory containing only operation-ineligible source is unavailable. Mixed scopes remain complete over their declared operation-specific universe and disclose operation exclusions. Duplicate, nested, and overlapping scopes are canonically deduplicated.

AST Scan details disclose the structural operation, supported extensions, roots, policy exclusions, eligible/analyzed file counts, and runtime limitations. Complete scans retain exact match totals. Unreadable paths, provider failures, the 5,000-file safety cap, or the 10-second deadline produce partial evidence with an unknown match total; skipped file counts are not reported as omitted matches.

### Check health

```text
code_health({ refresh: true, include: ["diagnostics", "servers"] })
```

Omitting `include` requests `diagnostics` and `servers`. The selectable sections are `diagnostics` and `servers`; Capability Warnings supplement diagnostic/server requests rather than acting as another section. `code_health` does not discover precomputed coverage or unused-code reports. A future batch-analyzer integration must collect its observations when called.

An existing file scope performs a live file diagnostic request, so completed-empty can establish no reported errors or warnings for that file. Omitted or directory scope reports a tracked-file diagnostic snapshot, not proof that the workspace is clean. Server inventory remains workspace-wide. `refresh: true` reports the actual workspace-runtime attempt—targeted active-client and restart counts plus the bounded stale-module assessment—rather than claiming recovered or fresh diagnostics.

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

Imports and exports remain available as explicit AST search kinds in `code_find`; they are not graph relation families. Test identity is not inferred: use PI grep for literal/regex source search or AST `call` when appropriate, neither of which claims that a match is a test.

## Honest correctness

- Semantic, structural, and filesystem evidence retain their provenance.
- Required capability failures are explicit; tools do not silently switch substrates.
- `maxResults` is a display cap. Results disclose shown, total, and omitted evidence when known.
- AST results declare their Scan universe; interrupted enumeration or analysis never becomes a complete absence claim.
- Invalid semantic-provider locations are omitted from project/external facts and disclosed separately as partial evidence.
- `code_health` reports live observations and does not infer analyzer results from conventional report files.
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

The old global `lsp.enabled` and `lsp.active` keys are deprecated and ignored. Missing binaries, disabled languages, structural startup failures, and obsolete settings appear as Capability Warnings in `/supi-ci-status`, diagnostic/server `code_health` results, and the existing one-time startup notice. If every language-server definition is disabled, the LSP runtime publishes an explicit disabled state and semantic capability remains unavailable. A ready runtime owner may have only lazy routes: server inventory remains status evidence, while diagnostics require an active ready project server or successful file-scoped readiness. `refresh: true` attempts recovery before the final Semantic health state is derived. Public health details expose one authoritative `semanticState` (`ready`, `pending`, `inactive`, `disabled`, or `unavailable`) plus structured `capabilityWarnings` supplemental status.

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
