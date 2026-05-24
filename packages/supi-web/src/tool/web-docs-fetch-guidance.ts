// Prompt guidance and tool description for the web_docs_fetch tool.

export const toolDescription = `Retrieve focused Context7 docs for a known library ID. Returns Markdown by default, or JSON snippets when \`raw: true\`.`;

export const promptSnippet = "web_docs_fetch — retrieve focused Context7 docs";

export const promptGuidelines = [
  "Use web_docs_fetch once the Context7 `library_id` is known; otherwise call web_docs_search first.",
  "Use web_docs_fetch only with Context7 library IDs such as `/facebook/react`, and ask a specific `query`.",
  "Use web_docs_fetch with `raw: true` only when you need JSON snippet objects instead of Markdown.",
];
