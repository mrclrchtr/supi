import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { agentProfileCatalogueStore } from "./session.ts";
import { registerAgentRunTool, registry } from "./tool/agent-run-tool.ts";

/** Register session-scoped Agent Profile discovery and foreground delegation tool. */
export default function agentExtension(pi: ExtensionAPI): void {
  // Tool registration: refreshed on every session start so the schema reflects the current catalogue.
  pi.on("session_start", async (_event, ctx) => {
    await agentProfileCatalogueStore.reload({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
    });
    registerAgentRunTool(pi);
  });

  pi.on("session_shutdown", async () => {
    await registry.cancelAll();
    agentProfileCatalogueStore.clear();
    registry.clear();
  });
}
