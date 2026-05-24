# Task 2: Remove embedded text-presence assertion blocks

Edit two files:
- packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts — remove the "keeps descriptions focused on each tool contract" test (it block with expect(brief.description).toContain("brief") etc.)
- packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-actions.test.ts — remove the "tree-sitter guidance" describe block
