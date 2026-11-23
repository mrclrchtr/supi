import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StatusSpinner } from "@mrclrchtr/supi-core/status-spinner";
import type { ReviewBatchHandle } from "./handle.ts";

/** Status key of the Background Review status line; the foreground Review uses its own key. */
export const BACKGROUND_REVIEW_STATUS_KEY = "supi-review-background";

/** The session's status line for active Background Reviews. */
export interface BackgroundReviewStatus {
  /** Show a started Review until its result settles (every task terminal, or stopped). */
  track(handle: ReviewBatchHandle, ctx: ExtensionContext): void;
  /** Re-render after a task of a tracked Review finished. */
  refresh(): void;
}

/** A status line that is either animated (TUI) or set once per label change (other modes). */
interface StatusLine {
  update(label: string): void;
  stop(): void;
}

/**
 * Animate only in the TUI. A Background Review runs while the session is idle, so in RPC an
 * animated spinner would stream about twelve `setStatus` records per second to the client.
 */
function createStatusLine(ctx: ExtensionContext, label: string): StatusLine {
  if (ctx.mode === "tui") {
    const spinner = new StatusSpinner(ctx, BACKGROUND_REVIEW_STATUS_KEY);
    spinner.start(label);
    return { update: (next) => spinner.update(next), stop: () => spinner.stop() };
  }
  let current = label;
  ctx.ui.setStatus(BACKGROUND_REVIEW_STATUS_KEY, current);
  return {
    update(next) {
      if (next === current) return;
      current = next;
      ctx.ui.setStatus(BACKGROUND_REVIEW_STATUS_KEY, current);
    },
    stop: () => ctx.ui.setStatus(BACKGROUND_REVIEW_STATUS_KEY, ""),
  };
}

/**
 * Keep one status line visible while any Background Review of the session is active. It counts
 * finished tasks across every active Review and clears when the last one settles or the session
 * ends. It deliberately does not emit `supi:working`: the session is free during the Review.
 */
export function registerBackgroundReviewStatus(pi: ExtensionAPI): BackgroundReviewStatus {
  const active = new Set<ReviewBatchHandle>();
  let spinner: StatusLine | undefined;

  const label = () => {
    const handles = [...active];
    const total = handles.reduce((sum, handle) => sum + handle.tasks.length, 0);
    const finished = handles.reduce((sum, handle) => sum + handle.snapshot().results.length, 0);
    const subject =
      handles.length === 1 ? "Background Review" : `${handles.length} Background Reviews`;
    return `${subject} running (${finished} of ${total} tasks finished)`;
  };
  const render = () => {
    if (!spinner) return;
    if (active.size === 0) {
      spinner.stop();
      spinner = undefined;
      return;
    }
    spinner.update(label());
  };

  pi.on("session_shutdown", () => {
    active.clear();
    spinner?.stop();
    spinner = undefined;
  });

  return {
    track(handle, ctx) {
      active.add(handle);
      if (!spinner) {
        spinner = createStatusLine(ctx, label());
      } else render();
      const settle = () => {
        // A Review of an ended session no longer owns the status line.
        if (active.delete(handle)) render();
      };
      handle.result.then(settle, settle);
    },
    refresh: render,
  };
}
