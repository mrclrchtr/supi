# Task 3: RED + GREEN: Apply maxResults to directory briefs

## Goal
Ensure directory briefs also use `maxResults` for file listing caps and show any relevant diagnostics. Add test coverage for directory mode with maxResults.

## Files
- `packages/supi-code-intelligence/__tests__/unit/directory-brief-recursive.test.ts` — add maxResults assertions
- `packages/supi-code-intelligence/src/brief-focused.ts` — apply maxResults to directory brief source file listing

## Change
- Directory brief `Source Files` listing already caps at 10; make this configurable via `maxResults`
- If `maxResults` is specified, use it as the cap; otherwise default to 10

## Verification
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/directory-brief-recursive.test.ts` — passes with new assertions

