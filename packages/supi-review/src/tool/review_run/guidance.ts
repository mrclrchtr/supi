import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../output-page.ts";

export const toolDescription = `Run one to four independent Inspection-only tasks concurrently against one exact frozen target. Use for code reviews instead of generic subagents. Each change task needs a non-empty change; committed change targets require from; all-state targets omit from. Creates a disposable linked Git worktree. A configured bootstrap can run one shell command there, and enabled auditing stores raw local replays. Output pages are limited to ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines.`;

export const promptSnippet = "Run independent inspection-only review tasks";

export const promptGuidelines = [
  "Use `review_run` for repository reviews and criteria-based inspections. Use task mode `change` for before-and-after changes and `state` for the frozen current code state.",
  "Do not use `review_run` for exploration.",
  "Do not use `review_run` for simple reviews you can complete directly.",
];
