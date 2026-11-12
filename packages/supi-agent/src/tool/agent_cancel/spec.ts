import { Type } from "typebox";
import { AGENT_CANCEL_TOOL_NAME } from "../names.ts";

/** Canonical public interface for background batch cancellation. */
export const agentCancelSpec = {
  name: AGENT_CANCEL_TOOL_NAME,
  label: "Agent Cancel",
  // Stops running child work; repeated requests are harmless.
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  exposure: "model-only",
  executionMode: "sequential",
  parameters: Type.Object(
    { batchId: Type.String({ minLength: 1, maxLength: 128 }) },
    { additionalProperties: false },
  ),
} as const;
