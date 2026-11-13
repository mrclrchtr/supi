import type { ToolNamespace } from "@earendil-works/pi-coding-agent";

/** Codemode namespace shared by every `web_*` tool. */
export const WEB_TOOL_NAMESPACE: ToolNamespace = {
  name: "web",
  description: "Public web search, page fetching, and library documentation lookup.",
  instructions: [
    "For library or framework usage, call web_docs_search for a libraryId, then web_docs_fetch.",
    "Use web_search for current or external sources such as issues, release notes, or news.",
    "Use web_fetch_md to read a known public URL.",
  ].join("\n"),
};
