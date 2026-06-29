// Prompt guidance and tool description for the supi_debug tool.

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

export const toolDescription = `Fetch recent session-local SuPi debug events, with optional filters and optional raw data when allowed. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first).`;

export const promptSnippet = "supi_debug — fetch recent SuPi debug events";

export const promptGuidelines = [
  "Use supi_debug when the user asks to inspect SuPi failures, fallback reasons, or recent debug events in this session.",
  "Use supi_debug's default sanitized output unless the user explicitly asks for raw diagnostics and settings allow raw supi_debug data.",
];
