# Enrich code_brief file/module briefs

## Goal

File and module briefs in `code_brief` should include structural context (outline, imports, exports) from tree-sitter and inline diagnostics from LSP. `maxResults` must be respected throughout.

## Architecture

Staged pipeline:

```
executeBrief(input, deps)
  │
  ├─ buildBriefModel(input, model, cwd)     → BriefModel     (sync, manifest + fs)
  │
  ├─ enrichBriefModel(model, provider, maxResults) → EnrichedBriefModel  (async, provider)
  │     ├─ enrichFileContext(provider, file)   → outline, imports, exports
  │     └─ enrichDiagnosticContext(cwd, file)  → errors, warnings
  │
  └─ renderBrief(enriched)                  → { content, details }  (sync, markdown)
```

## New files

- `src/use-case/brief-models.ts` — Typed DTOs: `FileBriefModel`, `ModuleBriefModel`, `DirectoryBriefModel`, plus `BriefEnrichment` (outline, imports, exports, diagnostics, nodeInfo)
- `src/use-case/brief-enrich.ts` — `enrichFileContext(provider, file, maxResults)`, `enrichDiagnosticContext(cwd, file?)`. Uses existing tree-sitter `outline`/`imports`/`exports` + `getSessionLspService(cwd).fileDiagnostics(file, 2)`.

## Changed files

- `src/brief-focused.ts` — `generateFocusedBrief` becomes async, produces typed `BriefModel`, accepts optional enrichment. Module brief gets diagnostics + entrypoint outlines. File brief gets full enrichment.
- `src/use-case/generate-brief.ts` — Wire `provider` + `maxResults` through `executePathBrief`/`executeFileBrief`. Extract `gatherTreeSitterContext` into enrichment module.
- `src/presentation/markdown/brief.ts` — Add `renderFileBrief`, `renderModuleBrief`. Add `appendDiagnosticsSection` helper. Update existing renderers.
- `src/tool/execute-brief.ts` — Pass `maxResults` into `BriefInput`.
- `src/use-case/types.ts` — Add `maxResults` to `BriefInput`.

## File brief enrichment

Sections added after module/entrypoint info:
- **Diagnostics** — first 5 error/warning messages inline, then total count
- **Outline** — top-level declarations (functions, classes, interfaces)
- **Imports** — module specifiers
- **Exports** — exported names with kinds

## Module brief enrichment

Added to existing module brief sections:
- **Diagnostics** — aggregated across all module source files
- **Entrypoint outlines** — outline for each entrypoint file (capped at 10 declarations each)

## maxResults wiring

| Section | Default cap | Capped by maxResults |
|---------|------------|---------------------|
| Outline items | 15 | yes |
| Imports | 10 | yes |
| Exports | 10 | yes |
| Diagnostic messages | 5 | yes |
| Source files | 10 | yes |

When maxResults is omitted, defaults apply.

## Non-goals

- Anchored/symbol brief modes unchanged (already have enrichment)
- Project brief mode unchanged
- No new provider capabilities
- No lsp_* / tree_sitter_* tool changes
