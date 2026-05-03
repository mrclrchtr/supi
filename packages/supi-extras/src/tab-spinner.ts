/**
 * Terminal tab title spinner for pi.
 *
 * Shows a braille spinner in the terminal tab title while the agent is working.
 * Recomputes the base title dynamically on every tick so that `/name` renames
 * and cwd changes are picked up automatically.
 */
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

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

  function stop(ctx: ExtensionContext) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    ctx.ui.setTitle(getTitle(pi, ctx.cwd));
  }

  function start(ctx: ExtensionContext) {
    stop(ctx);
    timer = setInterval(() => {
      const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      ctx.ui.setTitle(`${icon} ${getTitle(pi, ctx.cwd)}`);
      frame++;
    }, 80);
  }

  pi.on("agent_start", async (_event, ctx) => {
    start(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    stop(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stop(ctx);
  });
}
