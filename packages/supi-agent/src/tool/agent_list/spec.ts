import { AGENT_LIST_TOOL_NAME } from "../names.ts";
import { agentListParameters } from "./input.ts";

/** Canonical public interface for saved Agent Conversation discovery. */
export const agentListSpec = {
  name: AGENT_LIST_TOOL_NAME,
  label: "Agent List",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  exposure: "model-only",
  executionMode: "sequential",
  parameters: agentListParameters,
} as const;
