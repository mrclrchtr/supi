// Prompt guidance and tool description for the redesigned ask_user tool.

export const toolDescription =
  "Ask the user for a focused blocking decision. Use 1-10 related `choice` or `text` questions, and keep only one ask_user form active at a time.";

export const promptSnippet = "ask_user — request a focused blocking user decision";

export const promptGuidelines = [
  "Use ask_user with 1-10 related questions.",
  "Use ask_user `choice` for fixed options and `text` for freeform input; use `choice` for yes/no (binary).",
  "In ask_user, `recommendation` is type-specific: `choice` → exactly one `options[].value` (single-select: a string, defaulting to the first option; multi-select: an array); `text` → freeform prefilled text, omitted when blank.",
  "ask_user requires all questions answered to submit; unanswered questions produce `needs_discussion`.",
];
