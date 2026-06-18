# Task 5: Update documentation, guidance, and maintainer contract notes

## Goal
Make user-facing and maintainer-facing documentation match the new hard-cut `ask_user` contract and keyboard model.

## Files
- `packages/supi-ask-user/README.md`
- `packages/supi-ask-user/CLAUDE.md`
- `packages/supi-ask-user/src/tool/guidance.ts`
- `packages/supi-ask-user/src/schema.ts` (field descriptions only, if needed)

## Test exemption
This task is docs/guidance-only. It is test-exempt because behavior is covered by the prior unit tests, but it still requires concrete lint/search verification.

## Changes
- README: document the new request shape, removed fields, recommendation/default behavior, comments at form/question/option levels, ordered `responses`, `outcome`, review screen, and keyboard controls.
- README: remove documentation for `required`, `initial`, `allowOther`, `allowPartialSubmit`, `partial`, `discuss`, `answersById`, and `missingQuestionIds`.
- CLAUDE.md: update package design rules and tool contract notes to name the controller as source of truth for comments/responses and to describe the new form controls.
- guidance.ts: update description and prompt guidelines so models ask focused forms without referencing removed fields. Keep guidance concise.
- schema.ts descriptions: ensure model-facing descriptions use the new terminology (`recommendation`, comments are user UI affordances, no required/optional questions).

## Verification
Run:
```bash
pnpm exec biome check packages/supi-ask-user/README.md packages/supi-ask-user/CLAUDE.md packages/supi-ask-user/src/tool/guidance.ts packages/supi-ask-user/src/schema.ts
```
Expected result: no diagnostics.

Run:
```bash
rg -n "allowOther|allowPartialSubmit|answersById|missingQuestionIds|partial|discuss|initial|required" packages/supi-ask-user/README.md packages/supi-ask-user/CLAUDE.md packages/supi-ask-user/src/tool/guidance.ts
```
Expected result: no matches, except if `required` appears only in a phrase explicitly saying the old required/optional distinction was removed.
