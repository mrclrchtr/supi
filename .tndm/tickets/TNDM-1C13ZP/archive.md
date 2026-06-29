# Archive

## Verification Evidence — TNDM-1C13ZP

### Task 1: Shared test discovery
- Typecheck: `pnpm exec tsc -b tsconfig.json` — no errors
- Dead code confirmed deleted: `extractTestFunctions`, `findTestCompanionFiles`, `findReferenceTestFiles`, `isTestFile`, `TEST_FILE_PATTERNS` — 0 occurrences in src/
- New types: `TestDiscoveryProvenance`, `DiscoverTestFilesResult` added
- `discoverTestFilesForSource` returns `Promise<DiscoverTestFilesResult>` with `{ files, provenance }`
- Test name filtering: `isTestF` shortcut removed, only `isTestLikeName` entries survive

### Task 2: code_graph tests relation
- Typecheck: no errors
- Tests relation now checks provenance: 0 files + conventions-only → unavailable; conventions-only heading annotation
- `renderGraphResult` also updated to render unavailable section messages

### Task 3: code_impact changedFiles evidence
- `ImpactAnalysis.testProvenance` field added (both local and presentation types)
- `analyzeChangedFiles` sets `testProvenance` based on references availability
- ChangedFiles output appends `**Evidence: structural**` note
- Likely Tests heading annotated when conventions-only

### Task 4: code_context tests section
- `buildTestsSection` destructures `{ files, provenance }` from new return type
- Conventions-only with no files → "Tests unavailable — no semantic or structural provider available."
- Conventions-only with files → "Tests (conventions-only — no LSP/TS):" prepended
- Empty test names → "(no recognized test blocks)"

### Task 5: Tests
- `relations-tests.test.ts`: updated all `findTestCompanionFiles` calls to `discoverTestFilesForSource`, removed deprecated import, added provenance and name filtering tests
- `execute-graph.test.ts`: updated test assertions for unavailable output
- `code-context-tool.test.ts`: updated mock outlines to use `test`/`describe`/`it` names, updated assertions
- All 511 tests pass

### Task 6: Docs and metadata
- `tool-specs.ts`: code_graph and code_impact descriptions updated with provenance info
- `schemas.ts`: `includeTests` description updated
- `guidance.ts`: implicitly updated via tool-specs
- `README.md`: code_graph, code_impact, and Result style sections updated with evidence-strictness information
- `CLAUDE.md`: new "Evidence provenance in test discovery" and "Evidence in changedFiles impact" gotchas added

### Task 7: Final verification
- Typecheck: no errors
- Biome lint: only pre-existing `while (true)` complexity in unrelated files; my changes add no new lint issues
- Full test suite: **511 passed, 0 failed, 4 skipped**
- Repo-level `pnpm verify:ai`: **all 18 packages verified clean**
- Dead code: confirmed absent from source tree
