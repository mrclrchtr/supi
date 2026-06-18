# Archive

## Implementation Summary

### Changes Made

**Source:**
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts` — Added bounded tool/package-aware candidates to `findConventionTestFiles()` via focused helper functions. For `src/tool/execute-<name>.ts`, discovery now checks exact `code-<name>-tool`, `<name>-tool`, and `execute-<name>` stems in `__tests__/unit/` and `__tests__/integration/` with `.test`/`.spec` suffixes. The helper is intentionally scoped to package-relative `src/tool` paths and does not perform broad search or fuzzy matching.
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts` — Deduplicates line numbers before compacting grouped reference locations.
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — Renders `No likely tests found by bounded companion/package discovery.` when test discovery was explicitly requested and completed with no likely tests.
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts` — Mirrors the explicit empty-test note for changed-files impact output.

**Tests:**
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` — Added coverage for bounded `code-<name>-tool`, root-level `execute-<name>`, and non-`src/tool` exclusion behavior.
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — Added public `code_graph` coverage for bounded tool tests and same-line reference deduplication.
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — Added public `code_context` bounded tool-test coverage.
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — Added impact bounded tool-test coverage, explicit empty-test-note coverage, and tests metadata assertions.

**Docs:**
- `packages/supi-code-intelligence/README.md` — Documented bounded package/tool-aware discovery and explicit empty-test impact notes.
- `packages/supi-code-intelligence/CLAUDE.md` — Documented the maintainer-facing contract and gotchas for the same behavior.

### Review Fixes Applied

- Added the missing `execute-<name>` bounded candidate stem.
- Tightened bounded tool aliases to package-relative `src/tool` so docs and implementation match.
- Renamed RED-era tests and comments to describe the final expected behavior.
- Added direct regression coverage for `execute-<name>.test.ts` and for excluding non-`src/tool` paths.
- Refactored repeated candidate-addition logic into focused helper functions.

## Verification Results

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
# ✓ 80 tests passed across 4 files

RTK_DISABLED=1 pnpm exec tsc -b --pretty false packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
# ✓ passed

RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence/src/analysis/relations/tests.ts packages/supi-code-intelligence/src/use-case/support/semantic-references.ts packages/supi-code-intelligence/src/presentation/markdown/affected.ts packages/supi-code-intelligence/src/presentation/markdown/impact.ts packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
# ✓ passed

git diff --check
# ✓ passed

RTK_DISABLED=1 pnpm verify:ai
# ✓ 2084 tests passed, 18 packages verified
```

Note: live `code_*` tool smoke tests require reloading the PI extension process (`/reload` or restart) before they can reflect the modified TypeScript source.
