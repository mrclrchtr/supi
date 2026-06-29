## Goal

Apply the evidence-strictness pattern from `code_find` (TNDM-2841C2) to `code_graph`, `code_impact`, and shared test discovery. Every result that depends on LSP or TreeSitter explicitly declares its evidence source. No silent degradation when providers are absent. Delete dead code discovered during the change.

## Non-goals

- Changing `code_find` (already hardened)
- Changing `code_resolve`, `code_inspect`, `code_refactor`, `code_apply`, `code_health`
- Changing the best-effort per-relation dispatch model in `code_graph` — partial success is intentional
- Adding new relation kinds or impact modes

---

## Shared test discovery (`src/analysis/relations/tests.ts`)

### New types

```ts
export type TestDiscoveryProvenance = "semantic+conventions" | "conventions-only";

export interface DiscoverTestFilesResult {
  files: DiscoveredTestFile[];
  provenance: TestDiscoveryProvenance;
}
```

### `discoverTestFilesForSource` return type change

Returns `Promise<DiscoverTestFilesResult>` instead of `Promise<DiscoveredTestFile[]>`.

**Provenance logic:**
- `options.references` non-null AND found >=1 file via semantic references → `"semantic+conventions"`
- `options.references` null OR returned 0 files → `"conventions-only"`

### Test name filtering

In `extractTestFunctionNames`: remove the `isTestF` shortcut (which keeps all outline entries when the file path looks like a test). Only `isTestLikeName` (`describe`/`it`/`test`/`spec`) entries survive. A discovered file with zero matching names is still returned with empty `testNames` so callers can note "no recognized test blocks."

### Deletions

| Symbol | Reason |
|---|---|
| `extractTestFunctions` (L316) | Zero imports, zero references, not re-exported. Dead code. |
| `findTestCompanionFiles` (L104) | Only called internally by `findReferenceTestFiles` (L130) and test files. Inline into `findReferenceTestFiles`. |
| `findReferenceTestFiles` (L125) | After inlining `findTestCompanionFiles`, this is a one-line shim. Inline into `discoverTestFilesForSource`. |
| `isTestFile` (L289) | Only used internally by `findTestCompanionFiles`. Deleted with it. |

**Kept:** `isTestFilePath`, `isTestSupportPath`, `isTestLikeName`, `isTestFile` check in `findConventionTestFiles`.

---

## `code_graph` — tests relation (`src/tool/execute-graph.ts`)

In `collectRelation` → `case "tests"`, after `const { files, provenance } = await discoverTestFilesForSource(...)`:

| Condition | Output |
|---|---|
| files=0 AND conventions-only | `kind: "unavailable"`, "No test provider available — semantic and structural providers are absent" |
| files=0 AND semantic+conventions | "No companion test files found." (unchanged) |
| files>0 AND conventions-only | `**Tests** (N files, conventions-only — no LSP/TS)` |
| files>0 AND semantic+conventions | `**Tests** (N files)` (unchanged) |
| Any file with empty testNames | Append "(no recognized test blocks)" |

No changes to other relations (already honest about unavailability).

---

## `code_impact` — changedFiles (`src/tool/execute-impact.ts` + `src/use-case/generate-impact.ts`)

**Target-based path:** No change. Already fails explicitly when no semantic provider.

**changedFiles path:** Always appends to output:

```
**Evidence: structural** — impact limited to file-level module analysis
and path-based test discovery. Use `code_resolve` for semantic impact.
```

**includeTests annotation:** When test discovery is conventions-only, prepend test list with "Tests (conventions-only — no LSP/TS)".

**Internal:** `analyzeChangedFiles` returns `testProvenance?: TestDiscoveryProvenance` for the renderer.

---

## `code_context` — tests section (`src/use-case/generate-context.ts`)

In `buildTestsSection`, after `const { files, provenance } = await discoverTestFilesForSource(...)`:

| Condition | Output |
|---|---|
| files=0 AND conventions-only | "Tests unavailable — no semantic or structural provider available." |
| files=0 AND semantic+conventions | "No test companion files found." (unchanged) |
| files>0 AND conventions-only | Prepend "Tests (conventions-only — no LSP/TS):" |
| Any file with empty testNames | Append "(no recognized test blocks)" |

---

## Docs and metadata sync

| Surface | Change |
|---|---|
| `workflow/schemas.ts` | Add description notes for `includeTests` clarifying evidence source |
| `tool-specs.ts` | `code_impact` description: mention changedFiles is structural-only. `code_graph`: mention per-relation provenance |
| `tool/guidance.ts` | Add guideline about checking per-relation evidence annotations |
| `README.md` | Update `code_graph` and `code_impact` sections; add evidence-strictness note |
| `CLAUDE.md` | Add gotcha: changedFiles is structural-only; test provenance appears in output |

---

## Files changed

**Source:** 9 files
- `src/analysis/relations/tests.ts` — types, return change, deletions, name filtering
- `src/tool/execute-graph.ts` — tests relation logic
- `src/tool/execute-impact.ts` — pass test provenance
- `src/use-case/generate-impact.ts` — evidence note, test provenance in changedFiles, adapt to new return type
- `src/use-case/generate-context.ts` — tests section logic
- `src/tool/tool-specs.ts` — description updates
- `src/tool/guidance.ts` — guideline update
- `src/workflow/schemas.ts` — description notes

**Docs:** 2 files
- `README.md`
- `CLAUDE.md`

**Tests:** 4 files
- `__tests__/unit/analysis/relations-tests.test.ts` — new return type, conventions-only case, name filtering, remove `findTestCompanionFiles` usage
- `__tests__/unit/tool/execute-graph.test.ts` — tests relation: unavailable + conventions-only rendering
- `__tests__/unit/code-context-tool.test.ts` — tests section provenance annotation
- `__tests__/unit/code-impact-tool.test.ts` — changedFiles evidence note + test provenance
