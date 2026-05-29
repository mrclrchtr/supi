# Task 1: Add failing transcript tests for collapsed and expanded ask_user history rendering

# Goal
Lock the new chat-history UX in place before touching the renderer.

## Files
- `packages/supi-ask-user/__tests__/unit/transcript.test.ts`

## Change
Add regression coverage that describes the approved transcript behavior:

1. collapsed submitted result shows a status/count line, up to 2 answer lines, and a dim review hint
2. collapsed result with more than 2 answers reports the hidden-answer count instead of rendering every answer
3. expanded submitted result shows title, intro, question prompt text, and the selected answer
4. expanded partial/discuss result shows missing-required information and the discuss message when present

Keep the existing error-rendering test and update helper calls as needed so the tests can exercise both collapsed and expanded render paths.

## Verification
### RED
Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/transcript.test.ts -v
```

Expected result: the new assertions fail against the current implementation because `renderAskUserResult(...)` still renders the same compact output for every state and ignores Pi's expanded flag.

## Test mode
Test-driven. This task is complete only after the new tests fail for the intended reasons.
