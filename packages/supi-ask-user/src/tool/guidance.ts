// Prompt guidance and tool description for the ask_user tool.

export const toolDescription =
  "Ask the user a focused decision question (or up to 4 grouped questions) and pause for their answer when explicit user input is required to proceed safely. Use ask_user to clarify intent, choose between options, prioritize a short list, or confirm destructive actions — not for surveys, open-ended discovery, or information you can obtain by reading code yourself. Questions are `choice` (fixed options; set `multi: true` for multi-select) or `text` (freeform input). Structured questions can also use `recommendation`, `default`, `allowOther`, `allowDiscuss`, and option `preview` content.";

export const promptSnippet =
  "ask_user — pause and request a focused user decision with 1-4 typed questions, including rich choice and discuss flows";

export const promptGuidelines = [
  "Use ask_user only when explicit user input is required to proceed safely; do not use ask_user instead of reading code or reasoning from the existing context.",
  "Keep ask_user questionnaires bounded to 1-4 focused questions with short headers, and prefer one decision per ask_user call when possible.",
  "Use ask_user `choice` questions for fixed options and ask_user `text` questions for freeform input; set `multi: true` for multi-select instead of the removed `multichoice` field.",
  'Model yes/no prompts in ask_user as a `choice` question with `{ value: "yes", label: "Yes" }` and `{ value: "no", label: "No" }` options.',
  "Set ask_user `recommendation` when one option or a small set of options is clearly preferable so the UI can surface that guidance.",
  "Set ask_user `default` for a safe or common starting value; ask_user `default` controls the initial selection, while ask_user `recommendation` highlights what you think is best.",
  "Enable ask_user `allowOther` only when a custom answer is genuinely useful, use ask_user `allowDiscuss` only when the user may need to talk through the choice, and use ask_user option `description` or `preview` to explain options clearly.",
  "Do not call ask_user while another ask_user questionnaire is in flight; wait for the current ask_user result before issuing another one.",
];
