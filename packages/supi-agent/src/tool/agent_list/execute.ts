import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import type { DelegationController } from "../../delegation/controller.ts";
import type { DelegationConversationCandidate } from "../../delegation/conversation-state.ts";
import { agentProfileCatalogueStore } from "../../session.ts";
import { currentProfileUnavailableReason } from "../agent_run/batch-preflight.ts";
import { type AgentListRow, buildAgentListResult } from "./result.ts";
import { agentListSpec } from "./spec.ts";

type Execute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the public agent_list operation from raw branch history and live session state. */
export function makeAgentListExecute(controller: DelegationController): Execute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
  return async (_callId, input, _signal, _onUpdate, ctx) => {
    if (!Value.Check(agentListSpec.parameters, input)) throw new Error("Invalid agent_list input.");
    const params = input as { offset?: number; limit?: number };
    const catalogue = agentProfileCatalogueStore.get();
    if (!catalogue)
      throw new Error("Agent Profile catalogue is not yet loaded. Wait for session start.");
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 20;
    const rows = controller
      .conversations(ctx)
      .map((conversation) => buildAgentListRow(conversation, catalogue, ctx));
    return buildAgentListResult({ rows, offset, limit });
  };
}

function buildAgentListRow(
  conversation: DelegationConversationCandidate,
  catalogue: NonNullable<ReturnType<typeof agentProfileCatalogueStore.get>>,
  ctx: ExtensionContext,
): AgentListRow {
  const unavailableReason = conversationUnavailableReason(conversation, catalogue, ctx);
  const status = unavailableReason ? "unavailable" : (conversation.activity ?? "available");
  return {
    conversationId: conversation.conversationId,
    label: conversation.label ?? "(unavailable)",
    profileId: conversation.profileId ?? "(unavailable)",
    status,
    ...(unavailableReason ? { reason: unavailableReason } : {}),
    ...(conversation.activity ? { activity: conversation.activity } : {}),
  };
}

function conversationUnavailableReason(
  conversation: DelegationConversationCandidate,
  catalogue: NonNullable<ReturnType<typeof agentProfileCatalogueStore.get>>,
  ctx: ExtensionContext,
): string | undefined {
  if (conversation.unavailableReason) return conversation.unavailableReason;
  if (!conversation.profileId && !conversation.activity)
    return "Saved profile information is missing.";
  if (conversation.profileId) {
    const profileReason = currentProfileUnavailableReason(conversation.profileId, catalogue, ctx);
    if (profileReason) return profileReason;
  }
  if (!conversation.activity && !conversation.hasSavedContext) {
    return "No valid saved checkpoint is available.";
  }
  return undefined;
}
