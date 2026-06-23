// Prompt guidance and tool description for the supi_context agent tool.

export const toolDescription =
  "Get detailed context usage information for the current session — token breakdown, context window, compaction state, injected files, guideline sources, and more.";

export const promptSnippet =
  "supi_context — context usage report (token breakdown, context window)";

export const promptGuidelines = [
  "Use supi_context to check context window usage when approaching limits or after large tool results.",
  "Use supi_context before large operations to gauge remaining context window capacity.",
  "Prefer supi_context over asking the user to run /supi-context — it gives you the same data directly.",
];
