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
import { formatTitle, signalDone } from "@mrclrchtr/supi-core/api";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const AGENT_END_SETTLE_MS = 200;

export default function tabSpinner(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let pendingAgentEndTimer: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  let activeCount = 0;
  let hasActiveAgent = false;
  let pendingAgentEnd = false;
  let askUserActive = 0;
  let currentCtx: ExtensionContext | undefined;

  /** Build the current base title from session name and cwd. */
  function title() {
    return formatTitle(pi.getSessionName(), currentCtx?.cwd);
  }

  function clearPendingAgentEnd() {
    pendingAgentEnd = false;
    if (pendingAgentEndTimer) {
      clearTimeout(pendingAgentEndTimer);
      pendingAgentEndTimer = null;
    }
  }

  /** Restore the base title immediately. */
  function stop() {
    clearPendingAgentEnd();
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    if (currentCtx) currentCtx.ui.setTitle(title());
  }

  /** Show the ✓ done symbol in the title and play the terminal bell. */
  function showDone() {
    clearPendingAgentEnd();
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    if (currentCtx) signalDone(currentCtx, title());
  }

  /** Start the spinner interval. Overwrites any ✓ shown. */
  function start() {
    if (timer) return;
    if (!currentCtx) return;
    timer = setInterval(() => {
      const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      currentCtx?.ui.setTitle(`${icon} ${title()}`);
      frame++;
    }, 80);
  }

  function increment(ctx: ExtensionContext) {
    clearPendingAgentEnd();
    currentCtx = ctx;
    activeCount++;
    if (activeCount === 1 && askUserActive === 0) start();
  }

  function resumePendingAgent(ctx: ExtensionContext) {
    if (!pendingAgentEnd) return;
    clearPendingAgentEnd();
    currentCtx = ctx;
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

  pi.on("agent_start", async (_event, ctx) => {
    if (pendingAgentEnd) {
      resumePendingAgent(ctx);
      return;
    }
    hasActiveAgent = true;
    increment(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => resumePendingAgent(ctx));

  pi.on("agent_end", async (event, _ctx) => {
    const retryAwareEvent = event as { willRetry?: boolean };
    // Extension events do not currently type `willRetry`, but honor it when
    // present and otherwise rely on the short settle window plus turn_start.
    if (retryAwareEvent.willRetry) return;
    hasActiveAgent = false;
    agentEnded();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeCount = 0;
    currentCtx = ctx;
    stop();
  });

  pi.events.on("supi:working:start", () => {
    if (currentCtx) increment(currentCtx);
  });
  pi.events.on("supi:working:end", () => decrement());

  pi.events.on("supi:ask-user:start", () => {
    askUserActive++;
    // Pause the spinner so ask_user's attention title (set via signalWaiting)
    // is visible to the user instead of being overwritten on the next tick.
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  pi.events.on("supi:ask-user:end", () => {
    askUserActive = Math.max(0, askUserActive - 1);
    // Resume the spinner if the agent (or background work) is still running.
    if (askUserActive === 0 && activeCount > 0) start();
  });
}
