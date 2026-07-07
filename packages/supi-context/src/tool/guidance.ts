// Prompt guidance and tool description for the supi_context agent tool.

export const toolDescription =
  "Report current PI context usage: token breakdown, context window, compaction, injected files, guideline sources, tool definitions, and provider sections.";

export const promptSnippet =
  "supi_context — context usage report (token breakdown, context window)";

export const promptGuidelines = [
  "Use supi_context before large operations or when context usage is near the limit.",
];
