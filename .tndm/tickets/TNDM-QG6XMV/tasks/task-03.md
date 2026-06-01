# Task 3: Fix hover truncation in code_context buildDefinitionLines

In `src/use-case/generate-context.ts`, `buildDefinitionLines` takes only `split("\n")[0]` of LSP hover content. Multi-line TypeScript type signatures get cut off mid-type.

Change to show the full hover content. Keep it readable — limit to a reasonable number of lines (e.g., first 5 lines) or add a `...` continuation marker if truncated.
