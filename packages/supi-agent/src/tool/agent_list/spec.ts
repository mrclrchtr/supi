import { Type } from "typebox";
import { AGENT_LIST_TOOL_NAME } from "../names.ts";

export const AGENT_LIST_PAGE_SIZE = 50;

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
  parameters: Type.Object(
    {
      offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100_000 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: AGENT_LIST_PAGE_SIZE })),
    },
    { additionalProperties: false },
  ),
} as const;
