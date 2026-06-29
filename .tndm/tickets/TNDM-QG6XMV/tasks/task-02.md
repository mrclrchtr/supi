# Task 2: Update all follow-up tool suggestions to replace code_brief with code_context

Replace `code_brief` with `code_context` in next-step recommendations across:

- `src/tool/execute-graph.ts` L181
- `src/presentation/markdown/overview.ts` L56
- `src/presentation/markdown/brief.ts` L169
- `src/presentation/markdown/relations.ts` L197
- `src/presentation/markdown/affected.ts` L123
- `src/presentation/markdown/resolve.ts` L68, L85
- `src/brief-focused.ts` L217, L397
- `src/use-case/generate-context.ts` L428
- `src/use-case/generate-inspect.ts` L136
- `src/use-case/generate-brief.ts` L109, L118, L138, L156
- `src/use-case/generate-impact.ts` L240, L495, L499
- `src/brief.ts` L168
- `src/tool/target-id-params.ts` L5

For each, `code_brief` becomes `code_context` since code_context handles orientation when task is omitted.
