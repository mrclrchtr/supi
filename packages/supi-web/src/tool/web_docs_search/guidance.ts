import { MODEL_OUTPUT_LIMIT_DESCRIPTION } from "../result.ts";

export const toolDescription = `Search Context7 for library IDs; returns compact Markdown. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`;

export const promptSnippet = "web_docs_search: Context7 library IDs";

export const promptGuidelines = ["Use web_docs_search before web_docs_fetch if ID unknown."];
