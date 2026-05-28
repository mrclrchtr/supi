# Task 2: Delete execute-pattern.ts tool executor

Delete the tool-level executor. The underlying `executePattern()` use-case in `src/use-case/generate-pattern.ts` stays because `executeFindTool` dispatches to it for text/regex/ast modes.

**Files:**
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts` — delete the file

**Verification:** `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` — no import errors for the deleted module
