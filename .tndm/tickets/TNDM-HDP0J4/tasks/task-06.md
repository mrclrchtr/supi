# Task 6: Add renderGraphResult() to relations presentation renderer

## Goal
Add a `renderGraphResult()` function to the relations renderer that produces combined multi-relation markdown output.

## Files
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`

## Changes
Add `renderGraphResult()` that:
1. Takes a `sections` array — each section has a `kind` (references/callees/implements), `data`, and optional `error`/`unavailable` note
2. Renders each section under a `## Section` heading with its relation kind
3. Delegates to existing renderers (`renderCallersResult`, `renderImplementationsResult`, `renderCalleesResult`) for each section's data
4. Adds a summary header: `# Graph of \`symbol\`` with section counts
5. Adds a footer with usage hints (like existing tools do)

## Section structure
```ts
interface GraphSection {
  kind: "references" | "callees" | "implements" | "imports" | "exports" | "tests";
  status: "ok" | "unavailable" | "not-implemented";
  content?: string; // pre-rendered markdown from sub-renderer, or error message
}
```

## Verification
- Used by execute-graph.ts (task 3) — visual verification through actual tool usage
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json`
