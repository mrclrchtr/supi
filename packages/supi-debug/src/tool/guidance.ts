// Prompt guidance and tool description for the debug tool.

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

export const toolDescription = `Fetch recent SuPi debug events, or sanitized persisted events from a PI session JSONL via sessionFile, with optional exact Debug Operation ID and event filters. Raw data is available only for the live session when allowed. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first).`;

export const promptSnippet = "debug — fetch live or persisted SuPi debug events";

export const promptGuidelines = [
  "Use debug for SuPi failures, fallback reasons, or session debug events; pass sessionFile to inspect a prior session and request raw data only when explicitly asked and settings allow it.",
];
