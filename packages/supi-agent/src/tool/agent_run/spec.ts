import type { TSchema } from "typebox";
import { agentProfileCatalogueStore } from "../../session.ts";
import { buildAgentRunSchema } from "./schema.ts";

export const AGENT_RUN_TOOL_NAME = "agent_run";
export const AGENT_RUN_TOOL_LABEL = "Agent Run";

/** Build the parameter schema against the current profile catalogue. */
export function buildAgentRunParameters(): TSchema {
  const catalogue = agentProfileCatalogueStore.get();
  return buildAgentRunSchema(
    catalogue ?? {
      profiles: [],
      diagnostics: [],
      profileIds: [],
      omittedProfileCount: 0,
      sourceDirectories: { package: "", global: "" },
    },
  );
}

/** Canonical provider-facing metadata for the agent_run tool. */
export const agentRunSpec = {
  name: AGENT_RUN_TOOL_NAME,
  label: AGENT_RUN_TOOL_LABEL,
  executionMode: "sequential",
} as const;
