// Prompt guidance and tool description for the web_docs_fetch tool.

export const toolDescription = `Retrieve documentation context for a specific library via Context7. Returns up-to-date code snippets and documentation prose as Markdown, tailored to the query. Use web_docs_search first to find the library ID. Set raw=true to get JSON-serialized snippet objects instead of plain text. Requires a Context7 library ID (e.g. /facebook/react, /vercel/next.js).`;

export const promptSnippet =
  "web_docs_fetch — retrieve up-to-date documentation context from Context7 for a specific library";

export const promptGuidelines = [
  "Use web_docs_fetch to get up-to-date, version-specific documentation for any library.",
  "The library_id must be a Context7 library ID like /facebook/react or /vercel/next.js.",
  "Set raw=true only when you need structured JSON snippets instead of plain text Markdown.",
  "If the library ID is unknown, call web_docs_search first to find it.",
  "Prefer descriptive, specific queries over vague ones for better results.",
];
