# Phase 1 follow-up: fix code_resolve semantic gaps, schema drift, maxResults, and stale-file handling

## Problem

Phase 1 (TNDM-9S6M27) introduced `code_resolve` and targetId handles. Post-merge review found five regressions and one minor defect. All existing tests pass; none of the bugs are caught by the current test suite.

## Scope

Fix each finding without breaking any existing behavior or changing the Phase 1 contract.

### Finding 1: file-only resolve never uses semantic document symbols

`executeResolveService()` passes the composite provider only as `{ structural: provider }` to `resolveFileTargetGroup()`. The semantic provider never reaches file-level resolution, so `resolveFileTargetGroup` always falls through to structural exports only.

**Fix:** pass both halves of the composite provider: `{ semantic: provider, structural: provider }`.

Files:
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` lines 235, 264

### Finding 2: kind "symbol" breaks query resolution

`resolveSymbolTarget()` uses the `kind` option as a substring filter: `s.kind.toLowerCase().includes(kindLower)`. Passing `kind: "symbol"` matches no LSP symbol kind and produces empty results. This is a Phase 1 spec bug — the schema lists "symbol" as a valid kind but the runtime treats it as an LSP kind filter.

**Fix:** map public `kind` values to the upstream filter contract:
- `"symbol"` → no filter (all symbols wanted)
- `"export"` → `exportedOnly: true`
- `"command"`, `"setting"` → currently unsupported; return an explicit error
- All other values → pass through to the existing filter

Files:
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` around line 292
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` line 55

### Finding 3: public schema drifted from workflow schema

The active tool spec (`tool-specs.ts`) uses:
- `Type.String` for `kind` — no enum constraint, so invalid kinds reach runtime
- `Type.Number` without `minimum` for line/character — `line: 0` reaches runtime

The workflow schema (`schemas.ts`) has:
- `StringEnum([...])` for kind
- `minimum: 1` on line/character

**Fix:** reuse the workflow `CodeResolveParameters` in the active tool spec (or mirror its constraints). Export it from `schemas.ts` or set `minimum: 1` and use `StringEnum` in the active spec.

Files:
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` lines 14-17, 131-151
- `packages/supi-code-intelligence/src/workflow/schemas.ts`

### Finding 4: disambiguation ignores maxResults

`resolveSymbolTarget()` hard-caps candidates at `MAX_CANDIDATES = 8` and ignores the maxResults parameter. `executeResolveService()` doesn't pass `maxResults` to the symbol path either.

**Fix:** thread `maxResults` through `resolveSymbolTarget()` and respect it; also pass maxResults from the resolve service in the file-only case.

Files:
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` line 14, 94
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` line 316

### Finding 5: stale/missing backing files return available

When a file can't be fingerprinted at registration, `registerWorkflowTarget` stores `"unfingerprinted"`. During lookup, if the fingerprint is `"unfingerprinted"`, staleness is not checked — the entry returns `available`. If the file was deleted or becomes unreadable later, the targetId still resolves.

**Fix:** at lookup time, if the stored entry's fingerprint is `"unfingerprinted"` or the current file can't be read, re-fingerprint to force an up-to-date check. If the file is gone or unreadable now, return unavailable.

Files:
- `packages/supi-code-intelligence/src/workflow/target-store.ts` lines 162-166, 231-242

### Finding 6 (minor): disambiguation markdown suggests unregistered code_context

`renderDisambiguation()` suggests `code_context` alongside `code_references`, but `code_context` is intentionally unregistered until Phase 2.

**Fix:** replace `code_context` with `code_brief` or just `code_references` in the suggestion text.

File:
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` line 113

## Test coverage

For each finding, add or extend tests that fail before the fix and pass after:
- Finding 1: test file-only resolve with a semantic document symbols mock that returns richer data than structural exports
- Finding 2: test `kind: "symbol"`, `kind: "export"`, `kind: "command"`, `kind: "class"` query resolution
- Finding 3: existing tests cover this implicitly; no new test needed but confirm schema rejects invalid kinds
- Finding 4: test disambiguation respects maxResults
- Finding 5: test that deleted/missing files return unavailable on lookup
- Finding 6: test that disambiguation output doesn't mention code_context

## Verification

- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v`
- `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence`
