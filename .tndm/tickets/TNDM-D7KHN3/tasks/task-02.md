# Task 2: GREEN: Implement enrichment pipeline — models, enrich, wire, render

## Goal
Implement the enrichment pipeline: typed brief models, provider-based enrichment helpers, wiring into `generate-brief.ts` and `brief-focused.ts`, and updated markdown renderers. This makes file and module briefs show outline, imports, exports, and inline diagnostics.

## Files

### New
- `packages/supi-code-intelligence/src/use-case/brief-models.ts` — typed DTOs: `FileBriefModel`, `ModuleBriefModel`, `DirectoryBriefModel`, `BriefEnrichment`
- `packages/supi-code-intelligence/src/use-case/brief-enrich.ts` — `enrichFileContext(provider, file, maxResults)`, `enrichDiagnosticContext(cwd, file?)`, `gatherBriefEnrichment(provider, file, maxResults)`

### Changed
- `packages/supi-code-intelligence/src/brief-focused.ts` — `generateFocusedBrief` becomes async, accepts `{ provider, maxResults }`, produces typed models, calls enrichment
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — wire `deps.provider` and `input.maxResults` through `executePathBrief`/`executeFileBrief`; extract `gatherTreeSitterContext` → use enrichment module
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts` — add `renderFileBrief(model, enrichment, details)`, `renderModuleBrief(model, enrichment, details)`, `appendDiagnosticsSection(lines, diagnostics, maxResults)`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts` — pass `params.maxResults` into `determineInput`
- `packages/supi-code-intelligence/src/use-case/types.ts` — add `maxResults?: number` to `BriefInput`

## Change details

### brief-models.ts
```ts
interface BriefEnrichment {
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
  diagnostics: Array<{ line: number; severity: number; message: string }>;
  nodeInfo: null; // reserved for anchored mode
}
```

### brief-enrich.ts
- `enrichFileContext(provider, file, maxResults)` — calls provider.outline, provider.imports, provider.exports; caps each at maxResults with defaults
- `enrichDiagnosticContext(cwd, file?)` — calls getSessionLspService(cwd).service.fileDiagnostics(file, 2); caps messages at maxResults with default 5
- `gatherBriefEnrichment(provider, cwd, file, maxResults)` — orchestrates both and returns `BriefEnrichment`

### brief-focused.ts
- `generateFocusedBrief` signature becomes: `async (model, focusPath, opts?: { provider?, maxResults? })`
- File mode: builds `FileBriefModel`, calls enrichment, passes to `renderFileBrief`
- Module mode: builds `ModuleBriefModel`, calls enrichment for diagnostics + entrypoint outlines, passes to `renderModuleBrief`
- Directory mode: keeps existing format but accepts `maxResults` for file listing caps

### generate-brief.ts
- `executePathBrief`/`executeFileBrief` become async, accept `deps` (with provider) and `maxResults`
- Remove or update `gatherTreeSitterContext` references

### presentation/markdown/brief.ts
- `appendDiagnosticsSection(lines, diagnostics, maxResults)` — renders "## Diagnostics" with first N messages
- File brief renderer calls `appendTreeSitterContext` + `appendDiagnosticsSection`
- Module brief gets diagnostics section aggregated across files

## Verification
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/brief.test.ts` — Task 1 tests pass
- `pnpm exec tsc -p packages/supi-code-intelligence/tsconfig.json` — no type errors
