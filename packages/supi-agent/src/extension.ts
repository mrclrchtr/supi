import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentSettings, syncAgentRunTool } from "./config.ts";
import { registerProfileSettings } from "./profile-settings.ts";
import { agentProfileCatalogueStore } from "./session.ts";
import { registerAgentRunTool, registry } from "./tool/agent_run/register.ts";
import { registerAgentsCommand } from "./ui/agents-command.ts";

/** Register session-scoped Agent Profile discovery and foreground delegation tool. */
export default function agentExtension(pi: ExtensionAPI): void {
  let disposeProfileSettings: (() => void) | undefined;
  registerAgentsCommand(pi, registry);

  // Catalogue, settings sections, and tool schema refresh on every session start/reload.
  pi.on("session_start", async (_event, ctx) => {
    disposeProfileSettings?.();
    const catalogue = await agentProfileCatalogueStore.reload({
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
    });
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
    registerAgentRunTool(pi);
    syncAgentRunTool(pi, ctx.cwd);
  });

  pi.on("session_shutdown", async () => {
    disposeProfileSettings?.();
    disposeProfileSettings = undefined;
    await registry.cancelAll();
    agentProfileCatalogueStore.clear();
    registry.clear();
  });

  registerAgentSettings(pi);
}
