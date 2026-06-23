// Prompt guidance and tool description for the redesigned ask_user tool.

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

export const ASK_USER_TOOL_NAME = "ask_user";
export const ASK_USER_TOOL_LABEL = "Ask User";

export const toolDescription = `Open a blocking interactive TUI decision form. Use only when the agent needs focused user input before continuing. Supports 1-10 choice/text questions, one active form, and sequential execution. Requires TUI custom UI. Result text is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`;

export const promptSnippet = "ask_user — request a focused blocking user decision";

export const promptGuidelines = [
  "Use ask_user only when blocked on a focused user decision; not for status updates or broad surveys.",
  "Use one ask_user form for one decision; combine related questions instead of multiple calls.",
  "Use ask_user after needed inspection; do not make sibling tool calls that depend on the answer.",
  "Use ask_user `choice` for fixed/yes-no options and `text` for short freeform input.",
  "In ask_user, use stable ids/values; recommendations are single-choice string (omitted = first option), multi-choice array (omitted = none), or text string; unanswered questions return `needs_discussion`.",
];
