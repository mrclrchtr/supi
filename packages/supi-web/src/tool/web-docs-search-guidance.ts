// Prompt guidance and tool description for the web_docs_search tool.

export const toolDescription = `Search Context7 for library IDs before fetching docs. Returns a Markdown table of matching libraries and metadata.`;

export const promptSnippet = "web_docs_search — find Context7 library IDs before web_docs_fetch";

export const promptGuidelines = [
  "Use web_docs_search before web_docs_fetch when the Context7 `library_id` is unknown.",
  "Use web_docs_search with both `library_name` and a descriptive `query`, then choose the best `library_id`.",
];
