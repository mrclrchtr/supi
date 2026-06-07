# Task 3: Update use-case generators to stop passing nextQueries to renderers

Update callers of modified renderers:
1. `generate-context.ts` — stop passing `nextQueries` to `renderContextResult()`
2. `generate-inspect.ts` — stop passing `nextQueries` to `renderInspectResult()`
3. `generate-brief.ts` — stop calling `appendNextQueries()`
4. `generate-impact.ts` — stop passing `nextQueries` to impact/affected renderers

Keep `details.nextQueries` populated in all cases (structured data stays intact).
