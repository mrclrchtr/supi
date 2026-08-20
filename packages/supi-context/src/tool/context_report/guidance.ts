import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

// Tool description and prompt snippet for the context_report agent tool.

export const toolDescription =
  "Report current context capacity. Omit mode for a concise, constant-shape pressure snapshot; use mode: full only when diagnostic attribution is needed. Full output is compact JSON and is replaced with a temporary-file envelope above " +
  `${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`;

export const promptSnippet =
  "context_report — concise context-pressure snapshot (mode: full for diagnostics)";
