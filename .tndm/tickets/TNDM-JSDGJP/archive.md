# Archive

# Verification results

## Summary

Archived `TNDM-JSDGJP` after fresh verification of every planned task, review of the actual source/docs delta, and confirmation that Phase 0 remains a non-behavioral skeleton.

Phase 0 outcome:

- added `src/workflow/` skeleton with documented V2 handles, result-envelope types, planned schemas, and surface metadata
- added `workflow-surface.test.ts` to lock the Phase 0 contract
- updated `README.md` and `CLAUDE.md` with the V2 workflow roadmap and phase boundaries
- kept current runtime registration unchanged (`code_*`, `lsp_*`, `tree_sitter_*` still register; V2 workflow tools do not)

## Task-by-task fresh evidence

### Task 1 — RED: Lock the Phase 0 workflow skeleton contract in tests

Fresh evidence run:

```bash
test -f packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts
rg -n "code_resolve|code_context|code_find|code_graph|code_impact|code_refactor|code_apply|code_health|callers|natural|operation|action" packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Result:

- `workflow-surface.test.ts` exists
- grep confirmed the expected assertions are present for:
  - V2 tool names
  - no broad `action`
  - `operation` only for `code_refactor`
  - no misleading `callers`
  - no `natural` mode
- focused test run passed: **1 file, 6 tests passed**

Note: the transient RED state (missing `src/workflow/index.ts`) was exercised during apply; archive-time fresh evidence confirms the authored red/green test file exists and is actively exercised.

### Task 2 — GREEN: Add internal workflow skeleton, schemas, handles, and result contracts

Fresh evidence run:

```bash
find packages/supi-code-intelligence/src/workflow -maxdepth 1 -type f | sort
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

Result:

Created workflow skeleton files:

- `packages/supi-code-intelligence/src/workflow/ids.ts`
- `packages/supi-code-intelligence/src/workflow/index.ts`
- `packages/supi-code-intelligence/src/workflow/results.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`

Focused workflow test passed: **1 file, 6 tests passed**

TypeScript build passed with no output/errors.

### Task 3 — Document the V2 skeleton and phase boundaries in package docs

Fresh evidence run:

```bash
rg -n "V2 workflow|src/workflow|code_resolve|code_context|code_find|code_graph|code_impact|code_refactor|code_apply|code_health" packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Result:

- `README.md` contains the new **V2 workflow roadmap** and explicitly states that Phase 0 does not change the runtime surface
- `CLAUDE.md` contains the new **V2 workflow skeleton (Phase 0)** guidance and the phased-maintenance rules
- both docs mention `src/workflow/` as the internal design source of truth

### Task 4 — Guard Phase 0 against accidental runtime surface changes

Fresh evidence run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Result:

- combined registration/surface verification passed: **2 files, 20 tests passed**
- this proves:
  - planned V2 workflow names are **not** registered by `codeIntelligenceExtension()` in Phase 0
  - current `code_*`, `lsp_*`, and `tree_sitter_*` registration remains intact

### Task 5 — Final verification and phase handoff

Fresh evidence run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
rg "WORKFLOW_CODE_TOOL_NAMES|code_resolve|code_health" packages/supi-code-intelligence/src/workflow packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Result:

- package tests passed: **35 files passed, 2 skipped; 299 tests passed, 4 skipped**
- package/typecheck passed with no output/errors
- full-package Biome check returned the **accepted pre-existing baseline only**:
  - `useMaxParams` findings in older analysis/markdown files
  - one pre-existing `noExcessiveCognitiveComplexity` finding in `src/tool/execute-references.ts`
- grep confirmed workflow markers and docs are present

Additional fresh check to prove the Phase 0 delta itself is clean:

```bash
RTK_DISABLED=1 pnpm exec biome check \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts \
  packages/supi-code-intelligence/src/workflow/ids.ts \
  packages/supi-code-intelligence/src/workflow/results.ts \
  packages/supi-code-intelligence/src/workflow/schemas.ts \
  packages/supi-code-intelligence/src/workflow/surface.ts \
  packages/supi-code-intelligence/src/workflow/index.ts
```

Result: changed files checked clean; no new Phase 0 lint issues.

## Diff review and docs verification

Fresh diff review:

```bash
git diff --stat -- . ':(exclude).tndm'
git status --short packages/supi-code-intelligence
find packages/supi-code-intelligence/src/workflow -maxdepth 1 -type f | sort
```

Observed real delta:

Modified:

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`

Added:

- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts`
- `packages/supi-code-intelligence/src/workflow/ids.ts`
- `packages/supi-code-intelligence/src/workflow/index.ts`
- `packages/supi-code-intelligence/src/workflow/results.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`

Docs match final code:

- `README.md` and `CLAUDE.md` both describe `src/workflow/` as a non-registered Phase 0 skeleton
- documented V2 tool names match the names exported in `src/workflow/surface.ts`
- docs correctly state that public `lsp_*` / `tree_sitter_*` tools remain active in Phase 0
- no additional doc updates were required during archive

## Final outcome

`TNDM-JSDGJP` is verified complete.

Recommended next phase: implement **Phase 1 — `code_resolve` handles** as a separate ticket, with fresh verification and review/commit before proceeding to later phases.
