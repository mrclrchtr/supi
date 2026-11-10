# Changelog

## [11.3.1]

- `code_graph` references and implementations with the TypeScript server now report an incomplete result, naming the unloaded projects, when another `tsconfig.json` that includes the target file (such as a `__tests__` project that includes `../src`) has no open file. Previously, matches from such projects were silently missing and the result looked complete.
- With the TypeScript 6 or earlier server (tsserver), `code_graph` implementations in workspaces with several TypeScript projects are now reported as incomplete: tsserver searches implementations only in the target file's project. The note suggests references or TypeScript 7 instead of opening more files.
- `code_resolve` with a file target now reports a **file outline** instead of a "Target group": the result heading reads `# File outline of …`, structured output uses `kind: "file-outline"` and `unknownLevelCount`, and messages from `code_graph`, `code_orientation`, and `code_refactor_plan` explain that they need one declaration handle from the outline. Each declaration is classified as top-level, member (inside a class, interface, enum, namespace, or object literal), or local (inside a function or method body) instead of a single "nested" category.

## [11.3.0]

- Added package-specific release notes for code navigation, diagnostics, and refactoring.
- Capped `code_graph` reference results distribute sites across files, with matching source-reading suggestions.
- Fixed transient navigation failures when parallel requests first access different files, while retaining freshness checks.
- Rename and code-action planning now coordinate concurrent first file accesses without blocking parallel reads or weakening edit freshness checks.
- Scoped symbol queries no longer become incomplete solely because generated results were excluded outside the requested scope; ambiguous or genuinely incomplete evidence still requires explicit selection.
- Symbol queries scoped to an explicitly selected generated file or directory no longer report a false "Symbol not found" before the server has loaded that scope.
- Semantic symbol search with the TypeScript 6 or earlier server (tsserver) no longer reports existing symbols as missing at session start when a root config file, such as a dotfile excluded by `tsconfig.json`, sorts first; `code_find` and symbol targets now find them without opening a file first, and report an incomplete search instead of "not found" when no project file could be loaded.
- Symbol targets no longer require choosing from a single candidate when the only gap is an automatically excluded generated copy, such as a `dist/*.d.ts` declaration; the target resolves and notes the excluded path. Route failures and coverage gaps still require explicit selection. `code_graph` shows the same target notes, and semantic `code_find` reports an exact count and a null `partialReason` for such results while still disclosing the excluded paths in `automaticPathExclusion`.
- When a language server exits during startup, `code_health` and the status overlay now show the server's own error output instead of a transport error such as `write EPIPE` ([#570](https://github.com/mrclrchtr/supi/issues/570)).
- The status inspector adds **Refresh health** (`h` or F6), which runs the same bounded recovery and diagnostic refresh as `code_health({ refresh: true })` and reports its outcome separately from diagnostic confirmation ([#371](https://github.com/mrclrchtr/supi/issues/371)). Expanded file details now use only that file's diagnostic evidence, and a clean summary requires every requested tracked file to be confirmed.
- Health output distinguishes files without a compatible configured language server from configured servers that fail to start, and keeps a startup failure's explanation on later requests without retrying the server. Ownership roots outside the workspace are shown as absolute paths.
- An exact-file `code_health` refresh no longer rejects healthy routes for files outside the workspace or in automatically excluded paths.
- `code_graph` relations stay complete when only the display cap hides rows, and source paths use one canonical form across all code tools.
- `code_graph` callees and calls no longer report type-only `import("...")` references as calls, and TypeScript import types inside generic call arguments now parse correctly.
- `code_refactor_plan` omits edits that would leave text unchanged; a refactor with no real changes, such as renaming a symbol to its current name, no longer produces an applicable plan.
