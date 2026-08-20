import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../output-page.ts";

export const toolDescription = `List local reviewer replays or inspect one through bounded Replay Outline, selected-message, or raw views. Outline is metadata-only. Message and raw views can contain repository evidence and tool output. Pages are at most ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines. Available only when review auditing is enabled.`;

export const promptSnippet = "List or navigate local reviewer replays";

export const promptGuidelines = [
  "Use review_audit Replay Outline before selected-message or raw replay access.",
  "Do not repeat raw review_audit replay content unless necessary.",
];
