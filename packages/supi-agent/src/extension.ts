import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box } from "@earendil-works/pi-tui";
import {
  clearAgentsProfilePages,
  registerAgentCleanupCommand,
  registerAgentsCommand,
  registerRunBatchOwner,
} from "@mrclrchtr/supi-agent-runtime/api";
import { registerShellHints } from "@mrclrchtr/supi-core/session";
import { registerAgentSettings, syncAgentRunTool } from "./config.ts";
import { type DelegationBatchData, DelegationController } from "./delegation/controller.ts";
import { agentProfilePages } from "./profile-pages.ts";
import { registerProfileSettings } from "./profile-settings.ts";
import { agentProfileCatalogueStore } from "./session.ts";
import { cancelDelegationBatch } from "./tool/agent_cancel/execute.ts";
import { renderResult as renderCancelResult } from "./tool/agent_cancel/render.ts";
import { registerAgentListTool } from "./tool/agent_list/register.ts";
import { collectDelegationBatch, delegationProgress } from "./tool/agent_result/execute.ts";
import { renderCompletionNotice, renderResult } from "./tool/agent_result/render.ts";
import { buildCompletionNotice } from "./tool/agent_result/result.ts";
import type { DelegationBatchHandle } from "./tool/agent_run/batch-types.ts";
import { registerAgentRunTool } from "./tool/agent_run/register.ts";
import { AGENT_COMPLETION_MESSAGE_TYPE } from "./tool/names.ts";

/** Register session-scoped profiles and owned background and foreground delegation. */
export default function agentExtension(pi: ExtensionAPI): void {
  let disposeProfileSettings: (() => void) | undefined;
  let controller: DelegationController | undefined;
  registerShellHints(pi);

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
    const current = () => {
      if (!controller) throw new Error("The delegation session is closed.");
      return controller;
    };
    // The runtime registers agent_result and agent_cancel once and dispatches Delegation
    // Batches here. They stay active independently of the Agent Run tool setting.
    const owned = registerRunBatchOwner<DelegationBatchHandle, DelegationBatchData>(pi, {
      source: "supi-agent",
      noticeType: AGENT_COMPLETION_MESSAGE_TYPE,
      noticeGranularity: "task",
      buildNotice: buildCompletionNotice,
      reconcile: (branch, release) => controller?.reconcile(branch, release),
      collection: {
        collect: (callId, batch, ctx) => collectDelegationBatch(current(), callId, batch, ctx),
        cancel: (batch, { requested }, ctx) =>
          cancelDelegationBatch(current(), batch, requested, ctx),
        progress: delegationProgress,
        renderResult,
        renderCancel: renderCancelResult,
        canceledMessages: {
          wait: "Delegation wait canceled.",
          collection: "Delegation collection canceled.",
        },
      },
    });
    controller = new DelegationController(registry, owned);
    registerAgentRunTool(pi, controller);
    registerAgentListTool(pi, controller);
    syncAgentRunTool(pi, ctx.cwd);
  });

  // Parent turn, branch, context, and input events reach the runtime-owned batches directly.
  pi.on("session_shutdown", () => {
    controller = undefined;
    disposeProfileSettings?.();
    disposeProfileSettings = undefined;
    clearAgentsProfilePages(pi);
    agentProfileCatalogueStore.clear();
  });

  pi.registerMessageRenderer(AGENT_COMPLETION_MESSAGE_TYPE, (message, options, theme) => {
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(renderCompletionNotice(message, options, theme));
    return box;
  });
  registerAgentSettings(pi);
  registerAgentsCommand(pi, { profilePages: agentProfilePages });
  registerAgentCleanupCommand(pi);
}
