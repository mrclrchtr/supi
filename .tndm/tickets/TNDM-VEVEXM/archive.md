# Archive

## Verification Results

### Task 1: Remove 8 dedicated guidance test files
- Files deleted: supi-cache/guidance.test.ts, supi-debug/guidance.test.ts, supi-rtk/guidance.test.ts, supi-ask-user/guidance.test.ts, supi-web/guidance.test.ts, supi-code-intelligence/{guidance,lsp-guidance,tree-sitter-guidance}.test.ts
- Only remaining guidance test file: supi-lsp/guidance-detailed-diagnostics.test.ts (behavioral, kept intentionally)

### Task 2: Remove embedded text-presence assertion blocks
- extension-registration.test.ts: removed "keeps descriptions focused on each tool contract" test (5x .description.toContain())
- tree-sitter-tool-actions.test.ts: removed "tree-sitter guidance" describe block (promptSnippet.toContain(name)) + cleaned unused imports

### Task 3: Verify all remaining tests pass
- 545 tests, 181 suites, 0 failures across 6 packages
- TypeScript compilation: clean (no errors)
- Git diff: 10 files, 252 deletions, 0 insertions — test-only changes, no production code modified
