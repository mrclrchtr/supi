// Prompt guidance and tool description for the redesigned ask_user tool.

export const toolDescription =
  "Ask the user for a focused blocking decision when explicit human input is required to proceed safely. Use ask_user for short decision forms, not open-ended interviews or information you can obtain from the repo yourself. Each form can include 1-4 related questions. Questions are `choice` or `text`. Forms may optionally allow partial submit and discussion handoff instead of a final decision.";

export const promptSnippet =
  "ask_user — pause and request a focused user decision with a small decision form";

export const promptGuidelines = [
  "Use ask_user only when explicit user input is required to proceed safely; do not use ask_user instead of reading code or reasoning from the existing context.",
  "Keep ask_user forms small and cohesive: 1-4 related questions that belong to the same decision, and prefer a single question when that is enough.",
  "Use ask_user `choice` questions for fixed options and ask_user `text` questions for freeform input.",
  'Model yes/no prompts in ask_user as a `choice` question with `{ value: "yes", label: "Yes" }` and `{ value: "no", label: "No" }` options.',
  "Use ask_user `recommendation` to highlight the preferred option and ask_user `initial` to set the starting selection or prefilled value.",
  "Enable ask_user `allowOther` only when a custom answer is genuinely useful, and only for single-select choice questions.",
  "Enable ask_user `allowDiscuss` when the user may need to switch back into conversation instead of committing to a final answer, and enable ask_user `allowPartialSubmit` only when partial progress is still actionable.",
  "Do not call ask_user while another ask_user form is already in flight.",
];
