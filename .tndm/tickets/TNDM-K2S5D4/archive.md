# Archive

## Verification summary

### Plan coverage
- Task 1 (`Add failing regressions for shared test-analysis parity and provenance`) — verified by the focused regression suite covering the added parity/provenance cases in:
  - `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- Task 2 (`Implement a shared test-analysis contract for code_graph, code_context, and code_impact`) — verified by the same focused regression suite passing with the new shared contract behavior.
- Task 3 (`Broaden best-effort test-label extraction and document the evidence contract`) — verified by extraction-focused assertions in the shared discovery, graph, and context tests plus doc review of `packages/supi-code-intelligence/README.md` and `packages/supi-code-intelligence/CLAUDE.md`.
- Task 4 (`Run full verification and live smoke-check the unified tests surface`) — verified by fresh package typecheck, focused suite, repo-wide `pnpm verify:ai`, and a fresh live PI smoke check.

### Fresh commands run
1. Package + test typecheck
```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```
Result: exit 0 (`TypeScript: No errors found`).

2. Focused regression suite
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```
Result: exit 0 (`4 passed` test files, `70 passed` tests).

3. Repo-wide verification
```bash
RTK_DISABLED=1 pnpm verify:ai
```
Result: exit 0. Full workspace verification passed, including `pnpm biome:ai`, `pnpm typecheck:ai`, `pnpm test:ai`, and `pnpm pack:verify`. The run emitted existing repository warnings, but no blocking errors.

### Fresh live smoke check
1. Resolved target:
```text
code_resolve(query: "discoverTestFilesForSource", scope: "packages/supi-code-intelligence", kind: "function")
```
Resolved to `packages/supi-code-intelligence/src/analysis/relations/tests.ts:93:23` with targetId `tg-7539b808c042fc5b3192e8be8d28`.

2. Graph tests relation:
```text
code_graph(targetId: "tg-7539b808c042fc5b3192e8be8d28", relations: ["tests"])
```
Result: reported companion test file `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` and extracted test labels, including `describe("shared test discovery contract")` and multiple `it(...)` labels.

3. Context tests section:
```text
code_context(task: "find companion tests for this target", targetId: "tg-7539b808c042fc5b3192e8be8d28", include: ["tests"])
```
Result: reported the same companion test file `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` with the same extracted labels.

### Doc verification
Reviewed the real delta and verified that:
- `packages/supi-code-intelligence/README.md` describes test provenance as file-discovery-only evidence.
- `packages/supi-code-intelligence/CLAUDE.md` documents the separation between discovery provenance and test-label extraction, plus the intentional `_(no recognized test blocks)_` placeholder.
- The final code in `packages/supi-code-intelligence/src/analysis/relations/tests.ts`, `src/tool/execute-graph.ts`, `src/use-case/generate-context.ts`, and `src/use-case/generate-impact.ts` matches that documentation.

### Outcome
The ticket goal is satisfied: `code_graph`, `code_context`, and `code_impact` now share a unified internal test-analysis contract, provenance is discovery-only, fallback test-label extraction is broader but conservative, and live PI behavior matches the regression coverage.
