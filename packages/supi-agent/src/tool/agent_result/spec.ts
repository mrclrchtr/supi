import { Type } from "typebox";
import { AGENT_RESULT_TOOL_NAME } from "../names.ts";

export { makeAgentResultExecute } from "./execute.ts";

/** Canonical public interface for background result collection. */
export const agentResultSpec = {
  name: AGENT_RESULT_TOOL_NAME,
  label: "Agent Result",
  // Records collected results, checkpoints, and Usage in the session once.
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  exposure: "model-only",
  executionMode: "sequential",
  parameters: Type.Object(
    {
      batchId: Type.String({ minLength: 1, maxLength: 128 }),
      wait: Type.Optional(
        Type.Boolean({
          description:
            "Wait for every task to finish. Default: return completed results and pending status immediately; do not poll.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
} as const;
