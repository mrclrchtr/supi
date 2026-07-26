import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

// Prompt guidance and tool description for the supi_context agent tool.

export const toolDescription =
  "Report current context capacity. Omit mode for a concise, constant-shape pressure snapshot; use mode: full only when diagnostic attribution is needed. Full output is compact JSON and is replaced with a temporary-file envelope above " +
  `${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`;

export const promptSnippet =
  "supi_context — concise context-pressure snapshot (mode: full for diagnostics)";

export const promptGuidelines = [
  "Use supi_context before large operations or when context usage is near the limit.",
];
