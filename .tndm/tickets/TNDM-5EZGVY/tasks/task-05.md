# Task 5: supi-core: add runWithProgressWidget + move ReviewProgressWidget

## Goal
Add `runWithProgressWidget` to `packages/supi-core/src/tool-framework.ts`. Extracts the duplicated pattern from supi-review where a long-running operation gets a progress widget, working events, abort handling, and error catching.

## Files
- **Modify:** `packages/supi-core/src/tool-framework.ts`
- **Test:** test-exempt (TUI-dependent, pi-tui mocking is fragile)

## API design
```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export interface ProgressUpdate {
  message?: string;
  current?: number;
  total?: number;
}

export async function runWithProgressWidget<T>(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  title: string,
  runner: (signal: AbortSignal, onProgress: (p: ProgressUpdate) => void) => Promise<T>,
): Promise<T | null> {
  if (!ctx.hasUI) {
    // No UI — run without progress widget but still emit working events
    pi.events.emit("supi:working:start", { source: "supi-core" });
    try {
      return await runner(new AbortController().signal, () => {});
    } catch {
      return null;
    } finally {
      pi.events.emit("supi:working:end", { source: "supi-core" });
    }
  }

  return ctx.ui.custom<T | null>((tui, theme, _kb, done) => {
    const widget = new ReviewProgressWidget(tui, theme, title);
    let finished = false;

    const finish = (result: T | null) => {
      if (finished) return;
      finished = true;
      pi.events.emit("supi:working:end", { source: "supi-core" });
      widget.dispose();
      done(result);
    };

    widget.onAbort = () => {};

    pi.events.emit("supi:working:start", { source: "supi-core" });
    runner(widget.signal, (progress) => widget.updateProgress(progress))
      .then((result) => finish(result))
      .catch(() => finish(null));

    return widget;
  });
}
```

**Important:** The helper uses `ReviewProgressWidget` which currently lives in `supi-review/src/ui/progress-widget.ts`. We have two options:

**Option A:** Move `ReviewProgressWidget` to supi-core (preferred — makes the helper self-contained).
- Move `packages/supi-review/src/ui/progress-widget.ts` → `packages/supi-core/src/progress-widget.ts`
- Update supi-review to import from supi-core
- The helper imports it from the same package

**Option B:** Accept the widget as a factory parameter (more flexible but more complex API).

Choose **Option A** for simplicity.

## Test exemption rationale
TUI-dependent code with pi-tui widgets, ctx.ui.custom(), and event emitters. Mocking the full pi-tui stack is fragile and provides minimal value. Verified through integration testing in Tasks 7 and 8.

## Manual verification
- Run `/supi-review` after migration — progress widget appears and works
- Run `/supi-insights` after migration — working events fire, tab spinner shows activity
- Cancel mid-operation via Escape — widget disposes, working events stop
