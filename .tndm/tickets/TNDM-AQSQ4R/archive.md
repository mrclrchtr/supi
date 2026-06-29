# Archive

# Archive verification

## Ticket
- Ticket: `TNDM-AQSQ4R`
- Title: **Implement code_context as the task-focused workflow successor to code_brief**
- All 6 planned tasks are marked done in the ticket state.

## Fresh verification evidence

### Task 1 — RED contract coverage exists
Ran:
```bash
rg -n 'registers code_context with the workflow schema shape while keeping code_brief|returns semantic-preferred route for code_context when semantic is available|returns structural-preferred route for code_context when only structural is available|returns unavailable route for code_context when no capability is registered|is registered as an active public tool' \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts
```
Result:
- exit code `0`
- confirmed the intended RED-task test coverage exists for registration, routing, and the public `code_context` tool surface.

### Task 2 — public registration/routing/tool skeleton stay green
Ran:
```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts -v

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json -v
```
Result:
- first command exit code `0`
- **3 passed** test files
- **37 passed** tests
- second command exit code `0`
- package and test TypeScript builds stayed clean

### Task 3 — behavioral RED-task coverage exists
Ran:
```bash
rg -n 'falls back to orientation-style output when task is omitted|renders a task-focused bundle for a resolved target|filters to requested sections and caps repeated entries deterministically|calls out requested but unavailable docs and tests sections honestly|returns dedicated context details for orientation-style output when task is omitted|returns unavailable confidence for defs-only task context without a precise target|returns dedicated context details for a targeted task bundle|code_context' \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts
```
Result:
- exit code `0`
- confirmed the intended behavior/metadata regression coverage exists, including orientation fallback, task-focused sections, honest unavailable sections, resolve follow-up wording, and the no-target defs-confidence regression.

### Task 4 — task-focused code_context behavior works
Ran:
```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v

pnpm exec jiti /tmp/code-context-smoke.mjs
```
Result:
- first command exit code `0`
- **3 passed** test files
- **56 passed** tests
- second command exit code `0`
- smoke output proved:
  - `code_resolve` returned `targetId`/`spanId`
  - `code_context` returned a task-focused bundle with **Definitions**, **References**, and **Callees**
  - `code_brief` still returned orientation-style **Project Brief** output

### Task 5 — docs and workflow notes match the real delta
Ran:
```bash
git status --short

git diff --cached --stat -- . ':(exclude).tndm'

git diff --cached -- \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md \
  packages/supi-code-intelligence/src/workflow/names.ts \
  packages/supi-code-intelligence/src/workflow/surface.ts

rg -n 'code_context|planned \(Phase 2\)|active|compatibility|orientation' \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md \
  packages/supi-code-intelligence/src/workflow/names.ts \
  packages/supi-code-intelligence/src/workflow/surface.ts
```
Result:
- all commands exited `0`
- reviewed the real delta: 16 non-ticket files changed in `packages/supi-code-intelligence/**`, including the expected docs/workflow-note files
- confirmed the docs now describe `code_context` as **active** and **additive** alongside `code_brief`
- confirmed `README.md` / `CLAUDE.md` / `workflow/names.ts` / `workflow/surface.ts` match the final implementation state
- no additional doc edits were required during archive beyond the already-updated files

### Task 6 — full package verification and live smoke
Ran:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json -v

pnpm exec biome check packages/supi-code-intelligence

pnpm exec jiti /tmp/code-context-smoke.mjs
```
Result:
- first command exit code `0`
- **44 passed | 2 skipped** test files
- **417 passed | 4 skipped** tests
- second command exit code `0`
- package and test TypeScript builds stayed clean
- third command exit code `0`
- Biome check stayed clean across `packages/supi-code-intelligence`
- fourth command exit code `0`
- live smoke again confirmed:
  - `code_resolve` suggested active `code_context` follow-up usage
  - `code_context` preserved target identity and returned honest task-focused sections
  - `code_brief` remained the compatibility/orientation tool

## Docs review summary
- Reviewed the actual staged delta rather than assuming the plan was sufficient.
- Verified user-facing and maintainer-facing docs against the final code after post-review fixes.
- The later review fixes (confidence handling, lazy model build, test range consistency, resolve follow-up wording, target-id helper JSDoc, and execute-context cleanup) did not require extra doc changes beyond the already-touched docs and guidance files.

## Conclusion
The implemented change matches the approved intent: `code_context` is active as the additive, task-focused workflow successor to `code_brief`; the package verifies cleanly; docs and workflow notes match the final implementation; and the reviewed post-implementation fixes are included in the verified result.
