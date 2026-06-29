# Task 1: Remove code_pattern from tool specs, types, routing, and validation

Remove `code_pattern` from the active tool surface. The underlying use-case (`executePattern`) stays — `code_find` dispatches to it.

**Files:**
- `packages/supi-code-intelligence/src/intent/types.ts` — remove `"code_pattern"` from `CODE_INTELLIGENCE_TOOL_NAMES`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — remove the `code_pattern` entry from `CODE_INTELLIGENCE_TOOL_SPECS` array (the whole object block, including the import of `executePatternTool`)
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` — remove the `code_pattern` routing branch (`if (tool === "code_pattern")` block)
- `packages/supi-code-intelligence/src/tool/validation.ts` — remove the `code_pattern`-specific error message line (L39)

**Verification:** `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` — no errors from removed references
