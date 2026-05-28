# Task 1: Add code_find to intent types and tool spec array

**Goal:** Register `code_find` in the canonical tool name list and tool specs so it appears in the public surface alongside `code_pattern`.

**Files:**
- `packages/supi-code-intelligence/src/intent/types.ts` — Add `"code_find"` to `CODE_INTELLIGENCE_TOOL_NAMES` array
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — Add a new `code_find` entry to `CODE_INTELLIGENCE_TOOL_SPECS` array with:
  - Name: `"code_find"`
  - Label: `"Code Find"`
  - Description: Summarizes the unified search tool purpose (text, regex, AST, semantic modes) — see workflow surface.ts for reference text
  - `promptSnippet`: `"code_find — unified ranked code search"`
  - `basePromptGuidelines`: 3–4 guidelines covering mode defaults, kind filtering, and preference over `code_pattern`
  - `parameters`: `CodeFindParameters` from `../workflow/schemas.ts`
  - `run`: stub that calls `executeFindTool` (defined in next task) — for now, a temporary placeholder import or inline stub returning `{ content: "code_find: not yet implemented", details: undefined }`

**Verification:**
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- Extension registration test in `__tests__/unit/extension-registration.test.ts` still passes (adds `code_find` assertion in a later task)
- Tool spec array length increases by 1

