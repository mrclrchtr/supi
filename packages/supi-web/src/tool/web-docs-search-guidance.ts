// Prompt guidance and tool description for the web_docs_search tool.

export const toolDescription = `Search for libraries via Context7. Returns a Markdown table of matching libraries with metadata (ID, name, description, trust score, benchmark score, snippet count, versions). Use the library ID from results with web_docs_fetch to retrieve documentation.`;

export const promptSnippet =
  "web_docs_search — search Context7 for libraries matching a name, returns library IDs for use with web_docs_fetch";

export const promptGuidelines = [
  "Use web_docs_search to find Context7 library IDs by name before calling web_docs_fetch.",
  "Pass a descriptive query along with the library name for better relevance ranking.",
  "Review the search results carefully — pick the library ID that best matches the user's need.",
];
