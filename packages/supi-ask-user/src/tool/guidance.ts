// Prompt guidance and tool description for the redesigned ask_user tool.

export const toolDescription =
  "Ask the user for a focused blocking decision when explicit input is required to proceed safely. Requires an interactive UI with custom overlay support, and only one ask_user form can be active at a time. Use 1-4 related `choice` or `text` questions. Do not use ask_user for open-ended interviews or repo facts you can get yourself. Forms may allow partial submit or discussion handoff.";

export const promptSnippet = "ask_user — request a focused blocking user decision";

export const promptGuidelines = [
  "Use ask_user only when explicit user input is required to proceed safely; do not use ask_user for open-ended interviews or repo facts.",
  "Keep ask_user forms to 1-4 related questions; prefer one when possible.",
  'Use ask_user `choice` for fixed options and ask_user `text` for freeform input; model yes/no as `choice` with `{ value: "yes", label: "Yes" }` and `{ value: "no", label: "No" }`.',
  "Use ask_user `allowOther` only on single-select `choice`; use ask_user `allowDiscuss` or `allowPartialSubmit` only when actionable; do not call ask_user while another form is in flight.",
];
