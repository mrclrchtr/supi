// Prompt guidance and tool description for the ask_user tool.

export const toolDescription =
  "Ask the user a focused decision question (or up to 4 grouped questions) when explicit user input is required to proceed safely. Use for clarifying intent, picking between options, prioritizing a short set of features, or confirming a destructive action — not for surveys or open-ended discovery. Questions are `choice` (with options; set `multi: true` for multi-select) or `text` (freeform input). Structured questions can add `recommendation`, `default`, `allowOther`, `allowDiscuss`, and option `preview` content.";

export const promptSnippet =
  "ask_user — pause and request a focused decision (1-4 typed questions) when explicit user input is required to proceed, including rich choice and discuss flows";

export const promptGuidelines = [
  "Use ask_user only for decisions that require explicit user input — never as a substitute for reading code or thinking through a problem.",
  "Keep questionnaires bounded: 1-4 focused questions with short headers; prefer one decision per call when possible.",
  'There are two question types: `choice` for picking from options (single-select by default; set `multi: true` for multi-select — use this instead of the now-removed `multichoice`) and `text` for freeform input. For yes/no questions, use `choice` with options `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}`.',
  "Set `recommendation` when one option or a small set of options is clearly preferable, so the UI can surface that guidance.",
  "Set `default` to pre-select a starting value or option; the user can accept it with a single keystroke. Use it for safe/common defaults, distinct from `recommendation` which highlights what you think is best.",
  "Enable `allowOther` only when a custom answer is genuinely useful, and `allowDiscuss` only when the user may need to talk through the choice instead of deciding immediately.",
  "Use `description` to explain what each option means — it wraps naturally and a few sentences is fine. Reserve `preview` for code, config, or diagrams that need dedicated rendering space in a side pane.",
  "Do not call ask_user while another ask_user interaction is in flight — wait for the previous result before issuing another.",
];
