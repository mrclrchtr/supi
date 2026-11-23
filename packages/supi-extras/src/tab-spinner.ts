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
 *
 * The spinner animates only in the TUI. In other modes every `setTitle` call is a
 * record sent to the client, so the title shows the first spinner frame statically
 * and is sent only when its text changes.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createSessionNameTracker } from "@mrclrchtr/supi-core/session";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "@mrclrchtr/supi-core/spinner-frames";
import { formatTitle, signalDone } from "@mrclrchtr/supi-core/terminal";

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
  const getSessionName = createSessionNameTracker(pi);

  let timer: ReturnType<typeof setInterval> | null = null;
  /** Whether the working title is shown: animated by `timer` in the TUI, static elsewhere. */
  let spinning = false;
  /** Last title sent outside the TUI, to send only changed titles. */
  let lastStaticTitle: string | undefined;
  let pendingAgentEndTimer: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  let activeCount = 0;
  let hasActiveAgent = false;
  let pendingAgentEnd = false;
  let askUserActive = 0;
  let reviewTitleState: ReviewTitleState = { kind: "none" };
  let currentCtx: ExtensionContext | undefined;
  let cachedCwd: string | undefined;
  const unregisterBusHandlers: Array<() => void> = [];

  /** Build the current base title from cached cwd plus the latest safe session name lookup. */
  function title() {
    return formatTitle(getSessionNameSafe(), cachedCwd);
  }

  /** Set the terminal title to the review-phase icon if one is active. */
  function applyReviewTitle(): boolean {
    if (spinning) return false; // spinner is active, don't override

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
    spinning = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function animates(): boolean {
    return currentCtx?.mode === "tui";
  }

  /** The working title outside the TUI: the first spinner frame, never animated. */
  function showStaticSpinner() {
    safelySetTitle(`${BRAILLE_SPINNER_FRAMES[0]} ${title()}`);
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
  }

  function getSessionNameSafe(): string | undefined {
    try {
      // Call pi.getSessionName() as a canary — throws if context is stale.
      // The actual name is maintained reactively via createSessionNameTracker.
      pi.getSessionName();
      return getSessionName();
    } catch {
      handleStaleContext();
      return getSessionName();
    }
  }

  function safelySetTitle(nextTitle: string) {
    if (!currentCtx) return;
    // In the TUI Pi also writes the terminal title directly (e.g. on `/name`), so a
    // repeated title is not redundant there.
    if (!animates()) {
      if (nextTitle === lastStaticTitle) return;
      lastStaticTitle = nextTitle;
    }
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
    signalDone({ ui: { setTitle: safelySetTitle } }, title());
  }

  /** Start the spinner. Overwrites any ✓ shown. */
  function start() {
    if (spinning || !currentCtx) return;
    spinning = true;
    if (!animates()) {
      showStaticSpinner();
      return;
    }
    timer = setInterval(() => {
      const icon = BRAILLE_SPINNER_FRAMES[frame % BRAILLE_SPINNER_FRAMES.length];
      const baseTitle = title();
      safelySetTitle(`${icon} ${baseTitle}`);
      frame++;
    }, SPINNER_INTERVAL_MS);
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
    lastStaticTitle = undefined;
    rememberContext(ctx);
  });

  // The TUI animation picks up a renamed session on its next tick; a static title must be re-sent.
  pi.on("session_info_changed", async () => {
    if (spinning && !timer) showStaticSpinner();
  });

  pi.on("agent_start", async (_event, ctx) => {
    clearReviewTitle();
    if (pendingAgentEnd) {
      resumePendingAgent(ctx);
      return;
    }
    if (hasActiveAgent) {
      rememberContext(ctx);
      return;
    }
    hasActiveAgent = true;
    increment(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => resumePendingAgent(ctx));

  pi.on("agent_settled", async (_event, ctx) => {
    if (!hasActiveAgent) return;
    rememberContext(ctx);
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
