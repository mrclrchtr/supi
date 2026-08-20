import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../output-page.ts";

export const toolDescription = `Read a current-process Review continuation page of at most ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines. Use only with an artifact id from review_run or /supi-review. Artifacts expire after 30 minutes, reload, resume, or a branch change.`;

export const promptSnippet = "Continue paged review output";

export const promptGuidelines: string[] = [];
