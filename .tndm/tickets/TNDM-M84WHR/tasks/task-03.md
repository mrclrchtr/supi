# Task 3: Implement code_find ast mode call/type/test kinds

Extend `StructuredPatternKind` in `pattern-structured.ts` to include `call`, `type`, `test`. Add kind-specific outline filtering in `collectMatchesForFile` using tree-sitter node kinds (function_declaration etc. for `call`, class/interface/type/enum for `type`, name-pattern matching for `test`). Wire through `execute-find.ts` and query-params types.
