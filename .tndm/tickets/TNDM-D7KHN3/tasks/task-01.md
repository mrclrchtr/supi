# Task 1: RED: Update brief tests to assert enriched output for file/module modes

## Goal
Update existing brief tests in `__tests__/unit/brief.test.ts` (and any related test files) to assert that file and module briefs include structural enrichment (outline, imports, exports, diagnostics) when a provider is available, and that `maxResults` is respected.

## Files
- `packages/supi-code-intelligence/__tests__/unit/brief.test.ts` — add test cases asserting enriched sections appear
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-runtime.ts` — ensure mock provider supports `outline`, `imports`, `exports`

## Change
- Add test: file brief with mock provider shows outline, imports, exports, diagnostics sections
- Add test: file brief without provider omits enrichment sections gracefully
- Add test: module brief shows aggregated diagnostics
- Add test: `maxResults` caps outline items, imports, exports
- Add test: `maxResults` defaults when omitted

## Verification
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/brief.test.ts` — fails with assertion errors (enrichment not yet implemented)

