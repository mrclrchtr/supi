import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAntigravityAdapter } from "./agents/antigravity/adapter.ts";
import { registerConsultingFooterContribution } from "./footer.ts";
import { ConsultingRuntime } from "./runtime.ts";
import { registerConsultingSettings } from "./settings.ts";

/** Register the opt-in Consulting extension with its Antigravity adapter. */
export default function consultingExtension(pi: ExtensionAPI): void {
  const runtime = new ConsultingRuntime({ pi, adapter: createAntigravityAdapter() });
  const footer = registerConsultingFooterContribution(runtime);
  registerConsultingSettings(pi, runtime);

  pi.on("session_start", (_event, ctx) => {
    runtime.rebuildHandles(ctx.sessionManager.getBranch());
    void runtime.startRefresh(ctx.cwd, ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    runtime.rebuildHandles(ctx.sessionManager.getBranch());
  });

  pi.on("session_shutdown", async () => {
    await runtime.shutdown();
    footer.dispose();
  });
}
