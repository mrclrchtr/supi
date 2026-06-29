# Task 6: Wave 2b: Implement code_find AST call-site matching (call expressions)

Add a new branch in pattern-structured.ts collectMatchesForFile for kind: call that uses tree-sitter call_expression queries instead of outline-based matching. This requires a new substrate method or query capability. If the structural provider doesn't support call-expression queries, implement using tree-sitter query API directly. Update execute-find.ts to re-enable kind: call for AST mode. Update tool-specs to reflect the new capability.
