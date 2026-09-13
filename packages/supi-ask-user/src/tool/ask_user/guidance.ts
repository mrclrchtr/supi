// Prompt guidance and tool description for the redesigned ask_user tool.

export const toolDescription =
  "Open a blocking interactive TUI form only when a focused user decision blocks progress after available inspection. Not for status updates or broad surveys. Supports 1-10 choice/text questions, one active form, and sequential execution; requires TUI custom UI.";

export const promptSnippet = "request a focused blocking user decision";

export const promptGuidelines = [
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
