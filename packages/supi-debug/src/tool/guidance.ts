// Prompt guidance and tool description for the supi_debug tool.

export const toolDescription =
  "Fetch recent session-local SuPi extension debug events for troubleshooting, with optional source/level/category filters and optional raw event data when allowed.";

export const promptSnippet =
  "supi_debug — fetch recent SuPi extension debug events for troubleshooting";

export const promptGuidelines = [
  "Use supi_debug when the user asks to inspect SuPi extension failures, fallback reasons, or recent debug events in the current session.",
  "Use supi_debug's default sanitized output unless the user explicitly asks for raw diagnostics and the configured access level allows raw supi_debug data.",
];
