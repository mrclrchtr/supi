import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clearAgentsProfilePages, registerAgentsCommand } from "@mrclrchtr/supi-agent-runtime/api";
import { registerShellHints } from "@mrclrchtr/supi-core/session";
import { registerAgentSettings, syncAgentRunTool } from "./config.ts";
import { DelegationController } from "./delegation/controller.ts";
import { agentProfilePages } from "./profile-pages.ts";
import { registerProfileSettings } from "./profile-settings.ts";
import { agentProfileCatalogueStore } from "./session.ts";
import { registerAgentCancelTool } from "./tool/agent_cancel/register.ts";
import { registerAgentListTool } from "./tool/agent_list/register.ts";
import { registerAgentResultTool } from "./tool/agent_result/register.ts";
import { buildCompletionNotice } from "./tool/agent_result/result.ts";
import { registerAgentRunTool } from "./tool/agent_run/register.ts";
import { AGENT_COMPLETION_MESSAGE_TYPE } from "./tool/names.ts";

/** Register session-scoped profiles and owned background and foreground delegation. */
export default function agentExtension(pi: ExtensionAPI): void {
  let disposeProfileSettings: (() => void) | undefined;
  let controller: DelegationController | undefined;
  registerShellHints(pi);

  // Catalogue, settings sections, and tool schema refresh on every session start/reload.
  pi.on("session_start", async (_event, ctx) => {
    await controller?.close();
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
    controller = new DelegationController(registry, (batchId, tasks) => {
      pi.sendMessage(buildCompletionNotice(batchId, tasks), {
        deliverAs: "steer",
        triggerTurn: true,
      });
    });
    registerAgentRunTool(pi, controller);
    registerAgentListTool(pi, controller);
    registerAgentResultTool(pi, controller);
    registerAgentCancelTool(pi, controller);
    syncAgentRunTool(pi, ctx.cwd);
  });

  pi.on("session_tree", (_event, ctx) => controller?.refresh(ctx));
  pi.on("context", (event, ctx) => {
    const messages = event.messages.filter(
      (message) =>
        message.role !== "custom" ||
        message.customType !== AGENT_COMPLETION_MESSAGE_TYPE ||
        controller?.noticeVisible(message.details, ctx),
    );
    // Preserve Pi's unchanged-context path when every notice remains useful on this branch.
    return messages.length === event.messages.length ? undefined : { messages };
  });
  pi.on("agent_start", (_event, ctx) => controller?.observeParent(ctx.signal));
  pi.on("agent_settled", (event, ctx) => controller?.settleParent(event.aborted, ctx));
  pi.on("input", (event) => {
    if (event.source !== "extension") controller?.resumeDelivery();
  });
  pi.on("turn_end", (_event, ctx) => controller?.refresh(ctx));
  pi.on("session_shutdown", async () => {
    await controller?.close();
    controller = undefined;
    disposeProfileSettings?.();
    disposeProfileSettings = undefined;
    clearAgentsProfilePages(pi);
    agentProfileCatalogueStore.clear();
  });

  registerAgentSettings(pi);
  registerAgentsCommand(pi, { profilePages: agentProfilePages });
}
