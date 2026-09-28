import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clearAgentsProfilePages, registerAgentsCommand } from "@mrclrchtr/supi-agent-runtime/api";
import { registerAgentSettings, syncAgentRunTool } from "./config.ts";
import { agentProfilePages } from "./profile-pages.ts";
import { registerProfileSettings } from "./profile-settings.ts";
import { agentProfileCatalogueStore } from "./session.ts";
import { registerAgentRunTool } from "./tool/agent_run/register.ts";

/** Register session-scoped Agent Profile discovery and foreground delegation tool. */
export default function agentExtension(pi: ExtensionAPI): void {
  let disposeProfileSettings: (() => void) | undefined;

  // Catalogue, settings sections, and tool schema refresh on every session start/reload.
  pi.on("session_start", async (_event, ctx) => {
    disposeProfileSettings?.();
    const catalogue = await agentProfileCatalogueStore.reload({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
    });
    const registry = registerAgentsCommand(pi, { profilePages: agentProfilePages });
    disposeProfileSettings = registerProfileSettings(pi, catalogue);
    for (const diagnostic of catalogue.diagnostics) {
      if (!diagnostic.directory || diagnostic.code === "catalogue-overflow") continue;
      const reason = diagnostic.message.endsWith(".")
        ? diagnostic.message
        : `${diagnostic.message}.`;
      ctx.ui?.notify(
        `Agent profile '${diagnostic.profileId}' in ${diagnostic.directory} is unavailable: ${reason}`,
        "warning",
      );
    }
    registerAgentRunTool(pi, registry);
    syncAgentRunTool(pi, ctx.cwd);
  });

  pi.on("session_shutdown", async () => {
    disposeProfileSettings?.();
    disposeProfileSettings = undefined;
    clearAgentsProfilePages(pi);
    agentProfileCatalogueStore.clear();
  });

  registerAgentSettings(pi);
  registerAgentsCommand(pi, { profilePages: agentProfilePages });
}
