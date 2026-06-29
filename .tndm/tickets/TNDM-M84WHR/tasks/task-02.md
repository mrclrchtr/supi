# Task 2: Relax code_graph validation for file-level relations

When all requested `relations` are file-level (`imports`/`exports`), accept bare `file` without requiring `line`/`character`. Skip unnecessary target resolution in `execute-graph.ts`. Update `validation.ts` if needed.
