## Context

`packages/supi-insights/src/html.ts` is 508 lines. The function `generateHtmlReport` carries two `biome-ignore` suppressions for `noExcessiveCognitiveComplexity` and `noExcessiveLinesPerFunction`. The CSS block (~100 lines) and JS block (~40 lines) are template-string constants embedded inside the function body.

## What to do

Move the CSS and JS template strings to module-level constants:

```ts
const REPORT_CSS = `...`;
const REPORT_JS = `...`;
```

This lets the function body shrink below the Biome limits, allowing removal of both suppressions.

If additional sections can be cleanly extracted (e.g. `renderAtAGlanceHtml`, `renderChartSections`), do so — but the minimum viable change is just the CSS/JS extraction.

## Pre-validation

Read `packages/supi-insights/src/html.ts` fully. Verify that:
- The CSS block (lines ~176–282) and JS block (lines ~284–320) are pure template strings with no dynamic interpolation from function-scoped variables
- Moving them to module scope does not change the rendered output
- After extraction, the two `biome-ignore` comments at lines 16–17 can be removed
- `pnpm exec biome check packages/supi-insights/src/html.ts` passes without suppressions

Also verify no other code paths in the file reference local variables from within those blocks.

## Files affected
- `packages/supi-insights/src/html.ts`
