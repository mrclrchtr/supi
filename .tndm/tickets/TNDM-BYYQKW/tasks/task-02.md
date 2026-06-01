# Task 2: Wire real tests, diagnostics, and docs data into code_context stubbed sections

## Goal
Replace the three static stubs in `code_context` (`tests`, `diagnostics`, `docs`) with real data from LSP/tree-sitter providers.

## Files
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — replace `buildStaticSection` calls with real implementations
- `packages/supi-code-intelligence/src/use-case/gather-context.ts` — no structural changes; reuse existing `gatherNearbyDiagnostics` and add a JSDoc extraction helper
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — update tests to expect real data

## Changes

### 1. `tests` section

In `buildRequestedSection`, replace the `case "docs":` and `case "tests":` and `case "diagnostics":` static stubs.

For tests, add a new async helper `buildTestSection`:
- If no target, return `{ lines: ["Tests unavailable without a precise target."], ... }` with structural evidence false
- If no provider, return `{ lines: ["Tests unavailable — no active provider."], ... }`
- Otherwise:
  - a. Call `findTestCompanionsForTarget` (based on `findTestCompanions` logic from impact) to find companion test files for the target file
  - b. Build a list of test files (companion + any reference files that look like tests)
  - c. Use `provider.outline` on each test file (capped at 3 files) to extract test function names (functions starting with `test` or `it` or in `describe` blocks)
  - d. Return the list of test files with their test function names
  - Provenance: "structural" if outline was used, "heuristic" if only file names

### 2. `diagnostics` section

Add a new async helper `buildDiagnosticsSection`:
- If no target, return unavailable note
- If LSP unavailable, return explicit unavailable note ("LSP not available — check code_health")
- Otherwise:
  - a. Call `gatherNearbyDiagnostics(cwd, target.file, target.line)` for the target file
  - b. If target has references, call `gatherNearbyDiagnostics` for up to 3 reference files
  - c. Format as severity-prefixed lines: `- ERROR (L{n}): message` or `- WARN (L{n}): message`
  - d. Cap at 5 diagnostics total
  - Provenance: "semantic" (LSP-backed)
- Import `getSessionLspService` from `@mrclrchtr/supi-lsp/api` (same pattern as `gather-context.ts`)

### 3. `docs` section

Add a new async helper `buildDocsSection`:
- If no target, return unavailable note
- If no provider, return explicit unavailable note
- Otherwise:
  - a. Read the target file
  - b. Scan backward from the target line for a `/** ... */` JSDoc/TSDoc comment
  - c. If found, extract and return the comment text (trimmed, max 10 lines)
  - d. If not found, return "No JSDoc/TSDoc comment found for this symbol."
  - Provenance: "structural" (tree-sitter position + text extraction)
- Use `readFileSync` from `node:fs`, scan lines manually

### Test changes

In `code-context-tool.test.ts`:

1. Update existing test "calls out requested but unavailable docs and tests sections honestly" — instead of expecting "No docs context found", test with a mock provider that returns outline data and expect real results
2. Add new test: "returns real diagnostics from LSP when available" — mock `getSessionLspService` to return diagnostics, verify they appear
3. Add new test: "returns test functions from companion test files" — create a companion test file with outline data
4. Add new test: "returns JSDoc comment for target symbol" — write a file with a JSDoc comment, verify it appears in docs section
5. Add new test: "returns explicit unavailable for diagnostics when LSP is down" — mock LSP unavailable

## Verification
Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`

All new tests must pass. Existing tests may need minor assertion updates.
