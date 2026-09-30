import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ConsultingAgentAdapter, ConsultingAgentAvailability } from "../../agents/types.ts";
import type { ConversationHandleStore } from "../../conversation/handles.ts";
import { makeConsultingRunExecute } from "./execute.ts";
import { toolDescription } from "./guidance.ts";
import { renderConsultingCall, renderConsultingResult } from "./render.ts";
import { buildConsultingRunParameters, consultingRunSpec } from "./spec.ts";

/** Dependencies needed by the dynamically registered tool. */
export interface RegisterConsultingRunOptions {
  pi: ExtensionAPI;
  adapter: ConsultingAgentAdapter;
  availability: ConsultingAgentAvailability;
  handles: ConversationHandleStore;
}

/** Register consulting_run from one immutable availability snapshot. */
export function registerConsultingRunTool(options: RegisterConsultingRunOptions): void {
  const parameters = buildConsultingRunParameters(
    options.availability.agent,
    options.availability.catalogue,
  );
  options.pi.registerTool({
    ...consultingRunSpec,
    description: toolDescription,
    parameters,
    renderCall: renderConsultingCall,
    renderResult: renderConsultingResult,
    execute: makeConsultingRunExecute({
      pi: options.pi,
      adapter: options.adapter,
      availability: options.availability,
      handles: options.handles,
    }),
  });
}
