import { AskUserParamsSchema } from "../../schema.ts";

export const ASK_USER_TOOL_NAME = "ask_user";
export const ASK_USER_TOOL_LABEL = "Ask User";

/** Canonical provider-facing metadata for the ask_user tool. */
export const askUserSpec = {
  name: ASK_USER_TOOL_NAME,
  label: ASK_USER_TOOL_LABEL,
  parameters: AskUserParamsSchema,
  executionMode: "sequential",
} as const;
