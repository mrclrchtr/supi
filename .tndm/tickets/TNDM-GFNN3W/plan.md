## Review: `code_intel` bundled improvements

### Verdict: No blocking issues found.

All 171 tests pass, Biome is clean, TypeScript compiles without errors. The changes are well-structured, the fallback chains are correct, and the new behaviors match the documented intent. Below are residual risks, follow-up recommendations, and minor observations.

---

### Non-blocking findings

#### 1. Duplicated utility functions across action files (maintainability)

`isResolvedTargetGroup`, `highestConfidence`, and `dedupeRefs` are copy-pasted across multiple files:

| Function | Locations |
|---|---|
| `isResolvedTargetGroup` | `callers-action.ts:297`, `affected-action.ts:439`, `callees-action.ts:153`, `implementations-action.ts:210` |
| `highestConfidence` | `callers-action.ts:281`, `affected-action.ts:423`, `target-resolution.ts:488` |
| `dedupeRefs` | `callers-action.ts:273`, `affected-action.ts:415` |

**Why it matters**: If `ResolvedTargetGroup` or `ConfidenceMode` ever changes, each duplicate must be updated independently. This is regression-prone.
**Recommendation**: Move `isResolvedTargetGroup`, `highestConfidence`, and a generic `dedupeRefs` into `target-resolution.ts` (which already exports `ResolvedTargetGroup` and owns the type guard's domain). Then `affected-action.ts` and `callers-action.ts` can import them.

---

#### 2. `pattern-action.ts`: `collectStructuredFiles` has no file-count limit or timeout (performance risk)

```ts
// packages/supi-code-intelligence/src/actions/pattern-action.ts, line ~220
function collectStructuredFiles(scopePath: string): string[] {
  // ...recursively walks the entire scope tree...
  walk(scopePath);
  return files.sort(...);
}
```

**Why it matters**: A `pattern` call with `kind: "definition"` at project root on a large monorepo will recursively walk every directory and open a tree-sitter session for every JS/TS file. The ripgrep-based text search path has a 10-second timeout via `execFileSync({ timeout: 10000 })`; the structured path does not.
**Recommendation**: Add either a max file cap (e.g., 500 files, or stop after a 10-second timeout), or at minimum return a partial-result warning when the file list is very large.

---

#### 3. `callers-action.ts`: `candidateCount` slightly misleading in LSP path

```ts
// packages/supi-code-intelligence/src/actions/callers-action.ts, line ~165
for (const ref of refs) {
  // Count from ALL refs including declaration
  if (isInProjectPath(filePath, cwd)) projectCount++;
  else externalCount++;
}
for (const ref of filtered) {
  // Only filtered (non-declaration) refs go into results
  if (isInProjectPath(filePath, cwd)) projectRefs.push({...});
}
return { refs: projectRefs, candidateCount: projectCount, ... };
```

**Why it matters**: `candidateCount` includes the declaration itself (since it's counted from unfiltered refs), while `refs` excludes it. This means `candidateCount` can be `refs.length + 1`. The intent is reasonable (reporting total references found), but a reader looking at `candidateCount === 5` and only seeing 4 lines in the output may be confused.
**Recommendation**: Rename to `totalRefCount` or document the discrepancy. Pre-existing behavior, but worth noting.

---

#### 4. `brief-focused.ts`: `extractNamedExports` regex coverage is limited (accepted best-effort)

```ts
// packages/supi-code-intelligence/src/brief-focused.ts, line ~525
const declarationRegex =
  /export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
const namedExportRegex = /export\s*\{\s*([^}]+)\s*\}/g;
```

**Why it matters**: Won't match `export default function()`, `export * from './module'`, multiline named exports, or `export { default } from`. The README describes this as "lightweight," so it's acceptable — but if a future change expects this to be authoritative, it will silently produce incomplete public-surface counts.
**Recommendation**: Document the extraction limitations explicitly in the function's JSDoc.

---

#### 5. `affected-action.ts`: `omittedCount` approximation in file-level path

```ts
// packages/supi-code-intelligence/src/actions/affected-action.ts, line ~180
omittedCount:
  analysis.externalRefs + (analysis.affectedFiles.size > (params.maxResults ?? 8) ? 1 : 0),
```

**Why it matters**: This adds a flat `+1` when affected files exceed `maxResults`, rather than the actual difference. For most uses, this is a "some results omitted" indicator, not a precise count — acceptable.
**Recommendation**: Consider computing the actual overflow (`Math.max(0, analysis.affectedFiles.size - (params.maxResults ?? 8))`). Low priority.

---

#### 6. Test coverage gap: `loadDiagnostics` / `getOutstandingDiagnosticSummary` path is untested

The `prioritization-signals.test.ts` and `details-metadata.test.ts` tests verify coverage and KNIP signals, but neither sets up an LSP session, so the diagnostic-loading path is never exercised in tests:

```ts
// packages/supi-code-intelligence/src/prioritization-signals.ts, line ~95
function loadDiagnostics(cwd: string) {
  const lspState = getSessionLspService(cwd);
  if (lspState.kind !== "ready") return [];
  return lspState.service.getOutstandingDiagnosticSummary(2).map(...);
}
```

**Why it matters**: If `getOutstandingDiagnosticSummary` signature changes in `supi-lsp`, the mapping `.map((entry) => ({ file: ..., total: ..., errors: ..., warnings: ... }))` could silently produce bad data.
**Recommendation**: Add an integration-style test (or at minimum verify the mapping shape is compatible by inspecting the return type at typecheck time — which already passes, so this is low risk).

---

#### 7. Output format complexity in `executeFileLevelAffected` (readability)

```ts
// packages/supi-code-intelligence/src/actions/affected-action.ts, line ~170
lines.push(
  `**Risk: ${analysis.riskLevel.toUpperCase()}** | ${targetGroup.targets.length} exported target${...} | ${refSummary} | ${analysis.affectedFiles.size} file${...} | ${analysis.affectedModules.size} module${...} | ${analysis.downstreamCount} downstream (${analysis.confidence})`,
);
```

**Why it matters**: This is a very long template literal with many inline pluralization ternaries. Hard to read and change. The file already has a `biome-ignore-all` for `noExcessiveLinesPerFile`.
**Recommendation**: Extract to a small helper (e.g., `formatAffectedHeader()`) in a follow-up.



- [x] **Task 7**: Extract shared semantic-action helpers and make reference counting clearer
  - File: `packages/supi-code-intelligence/__tests__/fallback-chain.test.ts`
  - File: `packages/supi-code-intelligence/src/semantic-action-helpers.ts`
  - File: `packages/supi-code-intelligence/src/actions/callers-action.ts`
  - File: `packages/supi-code-intelligence/src/actions/affected-action.ts`
  - File: `packages/supi-code-intelligence/src/actions/callees-action.ts`
  - File: `packages/supi-code-intelligence/src/actions/implementations-action.ts`
  - Change: write/update tests first, then extract shared helpers for target-group checks / confidence ranking / file-line dedupe, and fix the caller-count UX issue so the reported count matches the rendered references or is otherwise explicit and non-misleading.
  - Verification (RED): `pnpm vitest run packages/supi-code-intelligence/__tests__/fallback-chain.test.ts`
  - Verification (GREEN): `pnpm vitest run packages/supi-code-intelligence/__tests__/fallback-chain.test.ts`

- [x] **Task 8**: Bound structured pattern scans and report partial results
  - File: `packages/supi-code-intelligence/__tests__/pattern-structured-search.test.ts`
  - File: `packages/supi-code-intelligence/__tests__/pattern-summary.test.ts`
  - File: `packages/supi-code-intelligence/src/pattern-structured.ts`
  - File: `packages/supi-code-intelligence/src/actions/pattern-action.ts`
  - Change: add failing tests for large-scope structured scans, then move the structured-pattern walk/match logic into a helper with an explicit file cap and partial-result warning surfaced in output/details.
  - Verification (RED): `pnpm vitest run packages/supi-code-intelligence/__tests__/pattern-structured-search.test.ts packages/supi-code-intelligence/__tests__/pattern-summary.test.ts`
  - Verification (GREEN): `pnpm vitest run packages/supi-code-intelligence/__tests__/pattern-structured-search.test.ts packages/supi-code-intelligence/__tests__/pattern-summary.test.ts`

- [x] **Task 9**: Tighten affected omission counts, document lightweight export extraction limits, and test LSP diagnostic mapping
  - File: `packages/supi-code-intelligence/__tests__/prioritization-signals.test.ts`
  - File: `packages/supi-code-intelligence/__tests__/directory-brief-recursive.test.ts`
  - File: `packages/supi-code-intelligence/src/prioritization-signals.ts`
  - File: `packages/supi-code-intelligence/src/brief-focused.ts`
  - File: `packages/supi-code-intelligence/src/actions/affected-action.ts`
  - Change: add failing tests first, then make file-level affected `omittedCount` precise, add concise JSDoc on the lightweight export extractor limitations, and cover the `getOutstandingDiagnosticSummary()` mapping path with a mocked ready LSP session.
  - Verification (RED): `pnpm vitest run packages/supi-code-intelligence/__tests__/prioritization-signals.test.ts packages/supi-code-intelligence/__tests__/directory-brief-recursive.test.ts`
  - Verification (GREEN): `pnpm vitest run packages/supi-code-intelligence/__tests__/prioritization-signals.test.ts packages/supi-code-intelligence/__tests__/directory-brief-recursive.test.ts`

- [x] **Task 10**: Finish readability cleanup and re-verify the package
  - File: `packages/supi-code-intelligence/src/actions/affected-action.ts`
  - File: `packages/supi-code-intelligence/README.md`
  - Change: extract the long file-level affected header formatting into a focused helper, document any remaining caller-count semantics in user-facing docs if needed, and run the package verification sweep.
  - Verification: `pnpm vitest run packages/supi-code-intelligence/ && pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json && pnpm exec biome check packages/supi-code-intelligence/`
