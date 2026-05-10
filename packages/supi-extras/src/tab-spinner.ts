/**
 * Terminal tab title spinner for pi.
 *
 * Shows a braille spinner in the terminal tab title while the agent is working.
 * Recomputes the base title dynamically on every tick so that `/name` renames
 * and cwd changes are picked up automatically.
 *
 * Also activates during long-running extension tasks such as `supi-review`.
 */
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Compute PI's default terminal title using the current session name and cwd. */
function getTitle(pi: ExtensionAPI, cwd: string): string {
  const base = path.basename(cwd);
  const session = pi.getSessionName();
  return session ? `π - ${session} - ${base}` : `π - ${base}`;
}

export default function tabSpinner(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let activeCount = 0;
  let currentCtx: ExtensionContext | undefined;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    if (currentCtx) {
      currentCtx.ui.setTitle(getTitle(pi, currentCtx.cwd));
    }
  }

  function start() {
    if (timer) return;
    if (!currentCtx) return;
    timer = setInterval(() => {
      const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      currentCtx?.ui.setTitle(`${icon} ${getTitle(pi, currentCtx.cwd)}`);
      frame++;
    }, 80);
  }

  function increment(ctx: ExtensionContext) {
    currentCtx = ctx;
    activeCount++;
    if (activeCount === 1) start();
  }

  function decrement() {
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) stop();
  }

  pi.on("agent_start", async (_event, ctx) => {
    increment(ctx);
  });

  pi.on("agent_end", async (_event, _ctx) => {
    decrement();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeCount = 0;
    currentCtx = ctx;
    stop();
  });

  pi.events.on("supi:working:start", () => {
    if (currentCtx) increment(currentCtx);
  });

  pi.events.on("supi:working:end", () => {
    decrement();
  });
}
