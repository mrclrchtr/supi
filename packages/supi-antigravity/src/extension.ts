import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AntigravityRuntime } from "./runtime.ts";
import { registerAntigravitySettings } from "./settings.ts";

/** Register the opt-in Antigravity Run extension. */
export default function antigravityExtension(pi: ExtensionAPI): void {
  const runtime = new AntigravityRuntime({ pi });
  registerAntigravitySettings(pi, runtime);

  pi.on("session_start", (_event, ctx) => {
    runtime.rebuildHandles(ctx.sessionManager.getBranch());
    void runtime.startRefresh(ctx.cwd, ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    runtime.rebuildHandles(ctx.sessionManager.getBranch());
  });

  pi.on("session_shutdown", async () => {
    await runtime.shutdown();
  });
}
