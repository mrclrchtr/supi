# Phase 2b: Remove code_pattern — superseded by code_find

## Summary

Remove `code_pattern` from the public tool surface. `code_find` (Phase 2a, TNDM-P3G5MG) already provides all `code_pattern` modes (text, regex, ast) plus semantic workspace symbol search. Keeping both registered creates unnecessary surface noise and forces the model to choose between equivalent tools.

This drops the public surface from 11 → 10 tools.

## Design

### What stays
- `code_find` — the sole unified search tool
- `executePattern()` use-case function in `src/use-case/generate-pattern.ts` — still used internally by `executeFindTool` (text/regex/ast modes dispatch through it)
- `pattern-summary.test.ts` — still tests the underlying `executePatternAction` handler directly; summary behavior remains intact through `code_find`
- All other `code_*` tools are unchanged

### What goes
- `code_pattern` from `CODE_INTELLIGENCE_TOOL_NAMES` in `intent/types.ts`
- The `code_pattern` entry from `CODE_INTELLIGENCE_TOOL_SPECS` in `tool/tool-specs.ts`
- `src/tool/execute-pattern.ts` — the tool-level executor wrapper (the underlying use-case stays)
- The `"code_pattern"` routing branch in `analysis/routing/planner.ts`
- The `code_pattern` validation error message in `tool/validation.ts`

### What gets updated (references)
- `brief-focused.ts` — `code_pattern` → `code_find` in next-tool suggestions
- `presentation/markdown/relations.ts` — `code_pattern` → `code_find`
- `presentation/markdown/implementations.ts` — `code_pattern` → `code_find`
- `targeting/resolve-file.ts` — `code_pattern` → `code_find`
- `targeting/resolve-anchored.ts` — `code_pattern` → `code_find`
- `workflow/surface.ts` — stale non-goal note about "Does not remove code_pattern in Phase 0"
- `README.md` — remove `code_pattern` section, update tool list
- `CLAUDE.md` — remove `code_pattern` section, update architecture doc, update tool count

### Test updates
- `__tests__/helpers/execute-action.ts` — replace `"pattern"` action with `"find"` action routing to `executeFindTool`
- `__tests__/unit/extension-registration.test.ts` — remove `code_pattern` registration test
- `__tests__/unit/planner-routing.test.ts` — remove `code_pattern` routing test
- `__tests__/unit/tool-adapters.test.ts` — `action: "pattern"` → `action: "find"` (8 refs)
- `__tests__/unit/pattern-structured-search.test.ts` — `action: "pattern"` → `action: "find"` (4 refs)
- `__tests__/unit/review-fixes.test.ts` — `action: "pattern"` → `action: "find"` (4 refs)
- `__tests__/unit/pattern-summary.test.ts` — `action: "pattern"` → `action: "find"` (3 refs)
- `__tests__/unit/pattern-duplicates.test.ts` — `action: "pattern"` → `action: "find"` (1 ref)

## Constraints
- Do not delete `src/use-case/generate-pattern.ts` or `src/pattern-structured.ts` — they power `code_find`'s text/regex/ast modes
- Do not rename test files — file names are identifiers, not public surface
- `code_find` guidance must not regress — it already says "Prefer code_find over code_pattern for new searches"
