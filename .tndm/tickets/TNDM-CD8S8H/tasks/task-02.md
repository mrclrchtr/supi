# Task 2: Move real tree-sitter code out of families, delete families/tree-sitter forwarders

Move `tool/families/tree-sitter/execute.ts` handlers into `tree-sitter/` directory (consolidate with `tree-sitter/tool-actions.ts`). Move `tool/families/tree-sitter/format.ts` into `tree-sitter/` directory. Update `tree-sitter/tool-actions.ts` imports. Delete the 3 remaining forwarders: `tool/families/tree-sitter/specs.ts`, `register.ts`, `guidance.ts`. Update `code-intelligence.ts` and `tree-sitter/session-lifecycle.ts` to import from canonical paths.
