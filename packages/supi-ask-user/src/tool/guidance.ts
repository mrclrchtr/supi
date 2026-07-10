// Prompt guidance and tool description for the redesigned ask_user tool.

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

export const ASK_USER_TOOL_NAME = "ask_user";
export const ASK_USER_TOOL_LABEL = "Ask User";

export const toolDescription = `Open a blocking interactive TUI decision form for focused user input. Supports 1-10 choice/text questions, one active form, and sequential execution; requires TUI custom UI. Result text is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`;

export const promptSnippet = "ask_user — request a focused blocking user decision";

export const promptGuidelines = [
  "Use ask_user only when blocked after inspecting what can be inspected; not for status updates or broad surveys.",
  "Use ask_user for one decision form; combine related choice/text questions and avoid sibling tool calls that depend on the answer.",
  "In ask_user, use stable ids/values; recommendations must match question type, and unanswered questions return `needs_discussion`.",
  "Set option.details on ask_user choice questions for trade-offs, code samples, or context the user needs to decide.",
];

/** Package defaults for the ask_user prompt surface (used by the config resolver). */
export const ASK_USER_PROMPT_SURFACE_DEFAULTS = {
  description: toolDescription,
  promptSnippet,
  promptGuidelines: [...promptGuidelines],
};
