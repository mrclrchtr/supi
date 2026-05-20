// Prompt guidance and tool description for the supi_debug tool.

export const toolDescription =
  "Fetch recent session-local SuPi extension debug events for troubleshooting.";

export const promptSnippet =
  "Fetch recent SuPi extension debug events when troubleshooting extension behavior.";

export const promptGuidelines = [
  "Use supi_debug when the user asks to inspect SuPi extension failures, fallback reasons, or recent debug events.",
  "supi_debug returns sanitized events by default; request raw data only when the user explicitly wants raw diagnostics and settings allow it.",
];
