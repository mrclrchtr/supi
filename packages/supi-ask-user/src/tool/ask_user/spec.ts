import { AskUserParamsSchema } from "../../schema.ts";

export const ASK_USER_TOOL_NAME = "ask_user";
export const ASK_USER_TOOL_LABEL = "Ask User";

/** Canonical provider-facing metadata for the ask_user tool. */
export const askUserSpec = {
  name: ASK_USER_TOOL_NAME,
  label: ASK_USER_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: AskUserParamsSchema,
  // Keep user forms out of nested tool calls.
  exposure: "model-only",
  executionMode: "sequential",
} as const;
