// Prompt guidance and tool description for the web_docs_fetch tool.

export const toolDescription = `Retrieve up-to-date documentation context for a specific library via Context7. Returns Markdown documentation and code snippets tailored to the query, or JSON-serialized snippet objects when \`raw: true\`. Use web_docs_fetch after web_docs_search or whenever the exact Context7 library ID is already known. Requires a Context7 library ID (e.g. /facebook/react, /vercel/next.js).`;

export const promptSnippet =
  "web_docs_fetch — retrieve focused, up-to-date Context7 docs for a known library ID";

export const promptGuidelines = [
  "Use web_docs_fetch after web_docs_search, or use web_docs_fetch directly when the exact Context7 `library_id` is already known.",
  "Use web_docs_fetch only with Context7 library IDs such as `/facebook/react` or `/vercel/next.js`.",
  "Use web_docs_fetch with a specific, task-oriented `query` to retrieve focused version-aware documentation instead of a vague broad dump.",
  "Use web_docs_fetch with `raw: true` only when you need structured JSON snippet objects instead of Markdown documentation.",
  "Call web_docs_search before web_docs_fetch when the correct `library_id` is unknown or ambiguous.",
];
