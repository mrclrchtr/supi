# Archive

## Verification summary

Implemented `code_impact` as the active preferred workflow impact tool in `packages/supi-code-intelligence`, kept `code_affected` as a compatibility alias, added diff-aware `changedFiles` handling, and kept `change`-only requests explicit unavailable/insufficient-evidence.

## Task-by-task fresh evidence

### Task 1 — RED: codify `code_impact` registration/schema/routing/follow-up contract
Fresh evidence (post-implementation closeout): the codifying assertions are present in the repo and are exercised by fresh passing targeted suites.

Command:
```bash
rg -n 'registers code_impact|routes code_impact|code_impact target error|changedFiles|insufficient-evidence|narrower target-based surface' packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts
```
Result: matched the expected test coverage in:
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
Exit status: 0

### Task 2 — GREEN: register `code_impact` and share the target-based impact engine
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```
Result: 5 files passed, 94 tests passed.
Exit status: 0

This verifies:
- `code_impact` registration
- schema exposure
- planner routing
- resolve guidance preferring `code_impact`
- compatibility of `code_affected`
- target-based impact details metadata

### Task 3 — RED: specify diff-aware `code_impact` inputs and honest unavailable outcomes
Fresh evidence (post-implementation closeout): the diff-aware and insufficient-evidence assertions are present in the repo and exercised by the focused suite below.

Codified assertions confirmed by the grep command above, including:
- `accepts changedFiles with optional baseRef and includeTests without requiring an anchored target`
- `returns an explicit insufficient-evidence result for change-only requests instead of heuristic guessing`
- `keeps code_affected on the narrower target-based surface`
- `code_impact changedFiles input returns impact details with diff-aware next queries`

### Task 4 — GREEN: implement diff-aware behavior and update docs
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
```
Result: 3 files passed, 59 tests passed.
Exit status: 0

This verifies:
- diff-aware `changedFiles` behavior
- optional `baseRef`
- explicit `includeTests`
- `change`-only insufficient-evidence behavior
- `code_resolve` guidance preferring `code_impact`

### Task 5 — Final verification: full package checks and workflow smoke test
Commands:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ --reporter=verbose
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
RTK_DISABLED=1 pnpm exec jiti /tmp/code-impact-smoke.mjs
```
Results:
- full package suite: 45 files passed, 2 skipped; 428 tests passed, 4 skipped
- typecheck: passed with no output
- biome: passed (`Checked 153 files`)
- smoke script: `SMOKE_OK`
Exit status: 0 for all four commands

Smoke script verified end-to-end behavior against the current working tree:
- `code_resolve` returned a `targetId`
- resolve guidance preferred `code_impact`
- `code_impact` produced `# Impact:` output
- `code_affected` produced `# Affected:` output
- `code_affected` displayed the compatibility note

## Docs review and verification

Reviewed actual doc delta with:
```bash
git diff -- packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md docs/tool-architecture.md
```
Result: doc changes are limited to the expected files and align with the implementation.

Verified final docs with:
```bash
rg -n 'code_impact|code_affected|compatibility alias|preferred workflow' packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md docs/tool-architecture.md
```
Result: docs consistently describe:
- `code_impact` as active/preferred
- `code_affected` as a compatibility alias
- the updated public tool surface and follow-up guidance
Exit status: 0

## Post-review follow-up verification

Applied the two optional consider items from review:
- consolidated `code_affected` compatibility note wording into one shared constant
- added maintainer JSDoc on `ImpactDetails`

Verified with:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
rg -n 'Compatibility alias|remains the compatibility alias' packages/supi-code-intelligence/src/presentation/markdown packages/supi-code-intelligence/src/use-case/generate-impact.ts
```
Result:
- targeted suite passed (59 tests)
- typecheck passed
- grep found only the single shared compatibility-note phrasing and no stale `remains the compatibility alias` variant
Exit status: 0
