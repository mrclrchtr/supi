import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FALLBACK_TITLE = "pi";

export default function tabSpinner(pi: ExtensionAPI) {
  let baseTitle = FALLBACK_TITLE;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let patched = false;

  function isSpinnerTitle(title: string): boolean {
    return SPINNER_FRAMES.some((f) => title.startsWith(`${f} `));
  }

  function patchSetTitle(ctx: ExtensionContext) {
    if (patched) return;
    const ui = ctx.ui;
    const orig = ui.setTitle.bind(ui);
    ui.setTitle = (title: string) => {
      if (!isSpinnerTitle(title)) {
        baseTitle = title || FALLBACK_TITLE;
        // While spinning, only update the stored base title;
        // the interval will render it with the spinner on the next tick.
        if (!timer) {
          orig(baseTitle);
        }
      } else {
        orig(title);
      }
    };
    patched = true;
  }

  function startSpinner(ctx: ExtensionContext) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      ctx.ui.setTitle(`${icon} ${baseTitle}`);
      frame++;
    }, 80);
  }

  function stopSpinner(ctx: ExtensionContext) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    ctx.ui.setTitle(baseTitle);
  }

  pi.on("session_start", async (_event, ctx) => {
    patchSetTitle(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    startSpinner(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    stopSpinner(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    frame = 0;
    // Best-effort restore so the spinner doesn't stick in the tab title
    ctx.ui.setTitle(baseTitle);
  });
}
