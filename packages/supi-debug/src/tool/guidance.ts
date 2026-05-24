// Prompt guidance and tool description for the supi_debug tool.

export const toolDescription =
  "Fetch recent session-local SuPi debug events, with optional filters and optional raw data when allowed.";

export const promptSnippet = "supi_debug — fetch recent SuPi debug events";

export const promptGuidelines = [
  "Use supi_debug when the user asks to inspect SuPi failures, fallback reasons, or recent debug events in this session.",
  "Use supi_debug's default sanitized output unless the user explicitly asks for raw diagnostics and settings allow raw supi_debug data.",
];
