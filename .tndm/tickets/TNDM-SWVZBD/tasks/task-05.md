# Task 5: Final verification: full repo checks and code_find smoke test

## Goal
Confirm the assembled change works end-to-end and does not regress the workspace.

## Files
No source edits expected. Only fix issues if verification exposes a directly related regression from this change.

## Verification commands
Run:

```bash
set -v
RTK_DISABLED=1 pnpm verify:ai
```

Then manually smoke-test the tool behavior in the active workspace by running `code_find` with:

```json
{
  "query": "executePattern",
  "scope": "packages/supi-code-intelligence/src/tool/execute-find.ts",
  "mode": "ast",
  "kind": "call",
  "maxResults": 10,
  "contextLines": 0
}
```

Expected result:
- `pnpm verify:ai` exits 0.
- The smoke `code_find` result includes `executePattern` call-site matches from `packages/supi-code-intelligence/src/tool/execute-find.ts`.

## Test mode
Final verification task. This is the integration gate for the whole plan.
