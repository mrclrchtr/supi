# Task 4: Run affected package tests and typechecks

## Goal
Verify the affected packages compile and their focused test suites pass before full-repo verification.

## Files
No source edits expected. Use this task to fix only issues surfaced by the commands below, in the same files touched by earlier tasks unless the failure identifies a directly related test/mock file.

## Verification commands
Run:

```bash
set -v
RTK_DISABLED=1 pnpm -s vitest run packages/supi-tree-sitter/__tests__/call-sites.test.ts packages/supi-tree-sitter/__tests__/session.test.ts packages/supi-tree-sitter/__tests__/unit/provider.test.ts --reporter=verbose
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: all commands exit 0.

## Test mode
Verification task for affected packages. If failures require code changes, make the smallest related fix and rerun the failing command until it exits 0.
