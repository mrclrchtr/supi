// Prompt guidance and tool description for the redesigned ask_user tool.

export const toolDescription =
  "Ask the user for a focused blocking decision. Use 1-10 related `choice` or `text` questions, and keep only one ask_user form active at a time.";

export const promptSnippet = "ask_user — request a focused blocking user decision";

export const promptGuidelines = [
  "Use ask_user only for blocking user input, not open-ended interviews or repo facts.",
  "Use ask_user with 1-10 related questions; prefer one when possible.",
  "Use ask_user `choice` for fixed options and ask_user `text` for freeform input; yes/no should be a `choice`.",
  "Keep one ask_user form active at a time.",
  "Use `recommendation` to suggest default choices or prefilled text.",
  "All questions are expected for a full submission — unanswered questions produce `needs_discussion` instead.",
  "Comments on questions and options are user UI affordances — do not reference removed fields like `required`, `initial`, `allowOther`, or `allowPartialSubmit`.",
];
