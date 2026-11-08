# Changelog

## [11.3.0]

- Added package-specific release notes for code navigation, diagnostics, and refactoring.
- Capped `code_graph` reference results distribute sites across files, with matching source-reading suggestions.
- Fixed transient navigation failures when parallel requests first access different files, while retaining freshness checks.
- Rename and code-action planning now coordinate concurrent first file accesses without blocking parallel reads or weakening edit freshness checks.
- Scoped symbol queries no longer become incomplete solely because generated results were excluded outside the requested scope; ambiguous or genuinely incomplete evidence still requires explicit selection.
- Symbol queries scoped to an explicitly selected generated file or directory no longer report a false "Symbol not found" before the server has loaded that scope.
- Semantic symbol search with the TypeScript 6 or earlier server (tsserver) no longer reports existing symbols as missing at session start when a root config file, such as a dotfile excluded by `tsconfig.json`, sorts first; `code_find` and symbol targets now find them without opening a file first, and report an incomplete search instead of "not found" when no project file could be loaded.
- `code_refactor_plan` omits edits that would leave text unchanged; a refactor with no real changes, such as renaming a symbol to its current name, no longer produces an applicable plan.
