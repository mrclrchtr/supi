// Prompt guidance and tool description for the web_docs_search tool.

export const toolDescription = `Search Context7 for library IDs and metadata before fetching docs. Returns a Markdown table of matching libraries (ID, name, description, trust score, benchmark score, snippet count, versions). Use web_docs_search when you know the library name but not the exact Context7 library ID.`;

export const promptSnippet =
  "web_docs_search — find Context7 library IDs and candidate versions before calling web_docs_fetch";

export const promptGuidelines = [
  "Use web_docs_search before web_docs_fetch when you do not already know the exact Context7 `library_id`.",
  "Use web_docs_search with both `library_name` and a descriptive `query` so Context7 can rank results for the user's actual task.",
  "Review web_docs_search results carefully and choose the `library_id` that best matches the user's framework, package scope, and version needs.",
];
