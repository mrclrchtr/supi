/**
 * Terminal tab title spinner for pi.
 *
 * Shows a braille spinner in the terminal tab title while the agent is working.
 * Recomputes the base title dynamically on every tick so that `/name` renames
 * and cwd changes are picked up automatically.
 *
 * Also activates during long-running extension tasks such as `supi-review`.
 * When the agent turn ends, a ✓ symbol is shown persistently until the next
 * agent starts or the session shuts down.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalDone } from "@mrclrchtr/supi-core/terminal";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const AGENT_END_SETTLE_MS = 200;

/** Icons shown in the terminal title when a review phase completes. */
const BRIEF_DONE_ICON = "\u{1F4CB}"; // 📋 clipboard
const REVIEW_DONE_ICON = "\u{1F50D}"; // 🔍 magnifying glass
const REVIEW_FAILED_ICON = "\u2717"; // ✗ ballot x

type ReviewTitleState =
  | { kind: "none" }
  | { kind: "brief-done" }
  | { kind: "brief-failed" }
  | { kind: "review-done" }
  | { kind: "review-failed" };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: spinner state and event wiring are intentionally colocated
export default function tabSpinner(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let pendingAgentEndTimer: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  let activeCount = 0;
  let hasActiveAgent = false;
  let pendingAgentEnd = false;
  let askUserActive = 0;
  let reviewTitleState: ReviewTitleState = { kind: "none" };
  let currentCtx: ExtensionContext | undefined;
  let cachedSessionName: string | undefined;
  let cachedCwd: string | undefined;
  const unregisterBusHandlers: Array<() => void> = [];

  /** Build the current base title from cached cwd plus the latest safe session name lookup. */
  function title() {
    return formatTitle(getSessionNameSafe(), cachedCwd);
  }

  /** Set the terminal title to the review-phase icon if one is active. */
  function applyReviewTitle(): boolean {
    if (timer) return false; // spinner is active, don't override

    const baseTitle = title();
    const icon = reviewTitleIcon();
    if (!icon) return false;

    safelySetTitle(`${icon} ${baseTitle}`);
    return true;
  }

  /** Return the appropriate review title icon, or empty string when idle. */
  function reviewTitleIcon(): string {
    switch (reviewTitleState.kind) {
      case "brief-done":
        return BRIEF_DONE_ICON;
      case "brief-failed":
        return REVIEW_FAILED_ICON;
      case "review-done":
        return REVIEW_DONE_ICON;
      case "review-failed":
        return REVIEW_FAILED_ICON;
      case "none":
        return "";
    }
  }

  /** Clear any active review title state and let normal title logic resume. */
  function clearReviewTitle() {
    reviewTitleState = { kind: "none" };
  }

  function clearPendingAgentEnd() {
    pendingAgentEnd = false;
    if (pendingAgentEndTimer) {
      clearTimeout(pendingAgentEndTimer);
      pendingAgentEndTimer = null;
    }
  }

  function clearSpinnerTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function handleStaleContext() {
    clearPendingAgentEnd();
    clearSpinnerTimer();
    activeCount = 0;
    hasActiveAgent = false;
    currentCtx = undefined;
  }

  function rememberContext(ctx: ExtensionContext) {
    currentCtx = ctx;
    cachedCwd = ctx.cwd;
    cachedSessionName = getSessionNameSafe();
  }

  function getSessionNameSafe(): string | undefined {
    try {
      const next = pi.getSessionName();
      if (next !== undefined) {
        cachedSessionName = next;
      }
      return cachedSessionName;
    } catch {
      handleStaleContext();
      return cachedSessionName;
    }
  }

  function safelySetTitle(nextTitle: string) {
    if (!currentCtx) return;
    try {
      currentCtx.ui.setTitle(nextTitle);
    } catch {
      handleStaleContext();
    }
  }

  /** Restore the base title, or show the review icon if one is active. */
  function stop() {
    clearPendingAgentEnd();
    clearSpinnerTimer();
    frame = 0;
    if (applyReviewTitle()) return;
    safelySetTitle(title());
  }

  /** Show the ✓ done symbol, or the review icon if one is active. */
  function showDone() {
    clearPendingAgentEnd();
    clearSpinnerTimer();
    frame = 0;
    if (!currentCtx) return;
    if (applyReviewTitle()) return;
    try {
      signalDone(currentCtx, title());
    } catch {
      handleStaleContext();
    }
  }

  /** Start the spinner interval. Overwrites any ✓ shown. */
  function start() {
    if (timer || !currentCtx) return;
    timer = setInterval(() => {
      const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      const baseTitle = title();
      safelySetTitle(`${icon} ${baseTitle}`);
      frame++;
    }, 80);
  }

  function increment(ctx: ExtensionContext) {
    clearPendingAgentEnd();
    rememberContext(ctx);
    activeCount++;
    if (activeCount === 1 && askUserActive === 0) start();
  }

  function resumePendingAgent(ctx: ExtensionContext) {
    if (!pendingAgentEnd) return;
    clearPendingAgentEnd();
    rememberContext(ctx);
    hasActiveAgent = true;
    if (askUserActive === 0) start();
  }

  /** Decrement count for supi:working tasks — restores title when idle. */
  function decrement() {
    const floor = hasActiveAgent || pendingAgentEnd ? 1 : 0;
    activeCount = Math.max(floor, activeCount - 1);
    if (activeCount === 0) stop();
  }

  function finalizeAgentEnd() {
    clearPendingAgentEnd();
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      showDone();
      return;
    }
    if (askUserActive === 0) start();
  }

  /** Defer the done state briefly so immediate retries do not flash ✓. */
  function agentEnded() {
    clearPendingAgentEnd();
    pendingAgentEnd = true;
    pendingAgentEndTimer = setTimeout(() => {
      finalizeAgentEnd();
    }, AGENT_END_SETTLE_MS);
    pendingAgentEndTimer.unref?.();
  }

  function unregisterEvents() {
    for (const unregister of unregisterBusHandlers.splice(0)) {
      unregister();
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    rememberContext(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    clearReviewTitle();
    if (pendingAgentEnd) {
      resumePendingAgent(ctx);
      return;
    }
    hasActiveAgent = true;
    increment(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => resumePendingAgent(ctx));

  pi.on("agent_end", async (event) => {
    const retryAwareEvent = event as { willRetry?: boolean };
    if (retryAwareEvent.willRetry) return;
    hasActiveAgent = false;
    agentEnded();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    unregisterEvents();
    clearReviewTitle();
    activeCount = 0;
    rememberContext(ctx);
    stop();
    currentCtx = undefined;
  });

  unregisterBusHandlers.push(
    pi.events.on("supi:working:start", () => {
      if (currentCtx) increment(currentCtx);
    }),
  );
  unregisterBusHandlers.push(pi.events.on("supi:working:end", () => decrement()));

  unregisterBusHandlers.push(
    pi.events.on("supi:ask-user:start", () => {
      askUserActive++;
      clearSpinnerTimer();
    }),
  );

  unregisterBusHandlers.push(
    pi.events.on("supi:ask-user:end", () => {
      askUserActive = Math.max(0, askUserActive - 1);
      if (askUserActive === 0 && activeCount > 0) start();
    }),
  );

  unregisterBusHandlers.push(
    pi.events.on("supi:review:brief-done", (payload: unknown) => {
      const data = payload as { kind: string };
      reviewTitleState =
        data.kind === "success" ? { kind: "brief-done" } : { kind: "brief-failed" };
      applyReviewTitle();
    }),
  );

  unregisterBusHandlers.push(
    pi.events.on("supi:review:review-done", (payload: unknown) => {
      const data = payload as { kind: string };
      reviewTitleState =
        data.kind === "success" ? { kind: "review-done" } : { kind: "review-failed" };
      applyReviewTitle();
    }),
  );
}
