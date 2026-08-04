import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { agentProfileCatalogueStore } from "./session.ts";

/** Register session-scoped Agent Profile discovery for the agents extension. */
export default function agentsExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    await agentProfileCatalogueStore.reload({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
    });
  });
  pi.on("session_shutdown", () => {
    agentProfileCatalogueStore.clear();
  });
}
