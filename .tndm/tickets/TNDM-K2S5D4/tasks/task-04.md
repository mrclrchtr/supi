# Task 4: Run full verification and live smoke-check the unified tests surface

## Goal
Confirm the assembled change works end-to-end in code, docs, and live tool behavior.

## Files
- No new source files; verification uses the files changed in tasks 1-3.

## Change
Run the full verification gate after implementation is complete.

## Verification
1. Typecheck the package and its tests:

```bash
pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

2. Re-run the focused regression suite:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts \
  --reporter=verbose
```

3. Run the repo-wide required verification command:

```bash
RTK_DISABLED=1 pnpm verify:ai
```

4. In the reloaded PI session, run a live smoke check on this repo:
   - `code_resolve` for `discoverTestFilesForSource` in `packages/supi-code-intelligence`
   - `code_graph` with `relations:["tests"]` on the resolved target
   - `code_context` with `include:["tests"]` on the same `targetId`

Expected live result:
- `code_graph` and `code_context` report the same discovered companion test file set for the same target
- provenance wording matches the discovery-only contract
- label output is either recognized test labels or the explicit placeholder, never helper-symbol noise

## Test mode
Verification/integration gate.
