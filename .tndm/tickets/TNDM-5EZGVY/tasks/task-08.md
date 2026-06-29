# Task 8: Consumer migration: supi-review + declarative persistChange (5 packages)

## Goal
Migrate supi-review to use `runWithProgressWidget` and migrate 5 settings consumers to declarative `persistChange`.

## Files

### supi-review
- **Modify:** `packages/supi-review/src/review.ts` — replace `runBriefWithLoader` and `runReviewWithLoader` with `runWithProgressWidget`
- **Modify:** `packages/supi-review/src/ui/progress-widget.ts` — update import path (moved to supi-core in Task 5)

### Settings consumers (declarative persistChange)
- **Modify:** `packages/supi-bash-timeout/src/settings-registration.ts`
- **Modify:** `packages/supi-cache/src/settings-registration.ts`
- **Modify:** `packages/supi-claude-md/src/settings-registration.ts`
- **Modify:** `packages/supi-rtk/src/rtk.ts`
- **Modify:** `packages/supi-insights/src/insights.ts`

## Changes

### supi-review/review.ts
Replace `runBriefWithLoader` and `runReviewWithLoader`:
```ts
import { runWithProgressWidget } from "@mrclrchtr/supi-core/tool-framework";

// In handleInteractive:
const synthesis = await runWithProgressWidget(pi, ctx, "Synthesizing review brief…",
  (signal, onProgress) => synthesizeReviewBrief({ model, modelRegistry: ctx.modelRegistry, cwd: ctx.cwd, snapshot, serializedContext, note: normalizedNote, signal, onProgress })
);
// ... handle result (was BriefSynthesisRunResult, now the raw return from synthesis function or null)

const result = await runWithProgressWidget(pi, ctx, "Running code review…",
  (signal, onProgress) => runReviewer({ prompt: plan.packet.prompt, model: plan.model, modelRegistry: ctx.modelRegistry, cwd: ctx.cwd, signal, snapshot: plan.snapshot, brief: plan.brief, onProgress })
);
// ... handle result
```

**Note:** `runWithProgressWidget` returns `T | null` on failure, not the discriminated union types (`BriefSynthesisRunResult`, `ReviewResult`). We need to adjust the callers to match. The runner functions should return their original result types, and null should be treated as cancel/failure.

### Settings consumers
Replace manual `persistChange` with `configType` on each setting item:

**Before:**
```ts
registerConfigSettings({
  id: "bash-timeout",
  label: "Bash Timeout",
  section: "bash-timeout",
  defaults: BASH_TIMEOUT_DEFAULTS,
  buildItems: (settings) => [...],
  persistChange: (_scope, _cwd, settingId, value, helpers) => { ... },
});
```

**After:**
```ts
registerConfigSettings({
  id: "bash-timeout",
  label: "Bash Timeout",
  section: "bash-timeout",
  defaults: BASH_TIMEOUT_DEFAULTS,
  buildItems: (settings) => [
    {
      id: "defaultTimeout",
      label: "Default Timeout",
      description: "Default timeout for bash tool calls in seconds",
      currentValue: String(settings.defaultTimeout),
      configType: "number",
      submenu: (currentValue, done) => createInputSubmenu(currentValue, "Timeout in seconds:", done),
    },
  ],
  // persistChange omitted — auto-generated
});
```

Apply the same pattern to all 5 packages. Each setting item gets a `configType` matching its value type.

### supi-review/progress-widget.ts
Change import to use the supi-core copy:
```ts
// Before: local import (no package import needed)
// After: re-export from supi-core location
export { ReviewProgressWidget } from "@mrclrchtr/supi-core/tool-framework";
```

Or alternatively, let supi-review import `ReviewProgressWidget` directly from supi-core and keep its own copy for backwards compat (re-export). The important thing is the widget now lives in supi-core.

## TDD
Test-exempt — refactoring existing behavior. Existing tests cover the settings and review flows.

## Verification
- `pnpm vitest run packages/supi-review/` passes
- `pnpm vitest run packages/supi-bash-timeout/` passes
- `pnpm vitest run packages/supi-cache/` passes
- `pnpm vitest run packages/supi-claude-md/` passes
- `pnpm vitest run packages/supi-rtk/` passes
- `pnpm vitest run packages/supi-insights/` passes
- `pnpm exec tsc -b` for each modified package passes
- `pnpm exec biome check packages/supi-review/ packages/supi-bash-timeout/ packages/supi-cache/ packages/supi-claude-md/ packages/supi-rtk/` passes
