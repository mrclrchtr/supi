# Task 7: Final verification: full test suite, repo check, manual smoke test

## Goal
Full end-to-end verification: typecheck, lint, all tests, and manual smoke test of the three affected tools.

## Steps

1. **Typecheck:** `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — must pass with zero errors.

2. **Lint:** `pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20` — must pass.

3. **Full test suite:** `pnpm vitest run packages/supi-code-intelligence/` — all tests pass. Check specifically:
   - `relations-tests.test.ts` — provenance + name filtering
   - `execute-graph.test.ts` — tests relation evidence
   - `code-context-tool.test.ts` — tests section evidence
   - `code-impact-tool.test.ts` — changedFiles evidence

4. **Repo-level verify:** `pnpm verify:ai` from workspace root — must pass (catches downstream impacts).

5. **Manual smoke test** using the actual tools on this repo:
   - `code_graph` with `relations: ["tests"]` on a target — verify provenance annotation appears
   - `code_impact` with `changedFiles` + `includeTests:true` — verify evidence note appears
   - `code_context` with a task + target — verify tests section has provenance when conventions-only

6. **Dead code confirmation:** `rg "extractTestFunctions" packages/supi-code-intelligence/src/` returns zero matches. `rg "findTestCompanionFiles" packages/supi-code-intelligence/src/` returns zero matches.

## Acceptance criteria
- All commands exit 0
- No regressions in existing functionality
- Evidence annotations visible in tool output
- Deleted symbols are absent from source tree
