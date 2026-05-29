# Task 4: Run full supi-ask-user verification and an interactive chat-history smoke test

# Goal
Confirm the assembled change works end-to-end in automated checks and in Pi's normal interactive transcript.

## Files
- no source-file edits planned in this task; this is the final verification gate for `packages/supi-ask-user`

## Verification
Run all package checks:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/ -v
pnpm exec tsc -b packages/supi-ask-user/tsconfig.json packages/supi-ask-user/__tests__/tsconfig.json
pnpm exec biome check packages/supi-ask-user
```

Then perform a manual smoke test in interactive Pi:

1. reload the workspace extension set with `/reload`
2. trigger an `ask_user` interaction that includes at least 2 answered questions
3. submit the form
4. in the **normal chat history**, confirm the collapsed tool card shows the compact summary and review hint
5. press `Ctrl+O` and confirm the tool card expands into a read-only review showing the original prompts and selected answers
6. press `Ctrl+O` again and confirm the card collapses back to the compact summary

Expected result: automated checks pass, and the interactive transcript matches the approved UX in both collapsed and expanded states.

## Test mode
Test-exempt. This task is verification-only; its purpose is to run the automated and manual end-to-end checks that prove the full change works.
