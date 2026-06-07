# Task 2: Remove Next-steps from presentation markdown renderers

Remove `## Next` sections from all 6 presentation renderers:
1. `context.ts` — remove `nextQueries` from `RenderContextParams`, remove rendering block
2. `brief.ts` — remove from `renderFileBrief()`, remove `appendNextQueries()` entirely
3. `inspect.ts` — remove `## Next` section
4. `impact.ts` — remove `## Next` section
5. `affected.ts` — remove both `## Next` sections
6. `relations.ts` — remove `---` footer with italic recommendation
