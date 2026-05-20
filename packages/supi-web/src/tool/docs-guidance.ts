// Prompt guidance and tool descriptions for the web_docs_search and web_docs_fetch tools.

export const searchToolDescription = `Search for libraries via Context7. Returns a Markdown table of matching libraries with metadata (ID, name, description, trust score, benchmark score, snippet count, versions). Use the library ID from results with web_docs_fetch to retrieve documentation.`;

export const fetchToolDescription = `Retrieve documentation context for a specific library via Context7. Returns up-to-date code snippets and documentation prose as Markdown, tailored to the query. Use web_docs_search first to find the library ID. Set raw=true to get JSON-serialized snippet objects instead of plain text. Requires a Context7 library ID (e.g. /facebook/react, /vercel/next.js).`;

export const searchPromptSnippet =
  "web_docs_search — search Context7 for libraries matching a name, returns library IDs for use with web_docs_fetch";

export const fetchPromptSnippet =
  "web_docs_fetch — retrieve up-to-date documentation context from Context7 for a specific library";

export const searchPromptGuidelines = [
  "Use web_docs_search to find Context7 library IDs by name before calling web_docs_fetch.",
  "Pass a descriptive query along with the library name for better relevance ranking.",
  "Review the search results carefully — pick the library ID that best matches the user's need.",
];

export const fetchPromptGuidelines = [
  "Use web_docs_fetch to get up-to-date, version-specific documentation for any library.",
  "The library_id must be a Context7 library ID like /facebook/react or /vercel/next.js.",
  "Set raw=true only when you need structured JSON snippets instead of plain text Markdown.",
  "If the library ID is unknown, call web_docs_search first to find it.",
  "Prefer descriptive, specific queries over vague ones for better results.",
];
