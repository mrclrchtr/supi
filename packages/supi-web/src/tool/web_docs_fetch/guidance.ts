import { MODEL_OUTPUT_LIMIT_DESCRIPTION } from "../result.ts";

export const toolDescription = `Fetch focused Context7 docs for a known Context7 library_id. Markdown by default; raw=true returns JSON snippets. Search first if unknown. ${MODEL_OUTPUT_LIMIT_DESCRIPTION}`;

export const promptSnippet = "web_docs_fetch: focused Context7 docs";

export const promptGuidelines = [
  "Use web_docs_fetch with a known library_id and narrow query; raw only for JSON.",
];
