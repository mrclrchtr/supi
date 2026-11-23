/** Stable names of the runtime-owned Result Collection tools. */
export const AGENT_RESULT_TOOL_NAME = "agent_result";
export const AGENT_CANCEL_TOOL_NAME = "agent_cancel";
/** Both collection tools; activated and deactivated together. */
export const COLLECTION_TOOL_NAMES: readonly string[] = [
  AGENT_RESULT_TOOL_NAME,
  AGENT_CANCEL_TOOL_NAME,
];
