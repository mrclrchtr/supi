// Prompt guidance and tool description for the debug tool.

export const toolDescription =
  "Fetch recent SuPi debug events to diagnose failures or fallback reasons, or fetch sanitized persisted events from a PI session JSONL via sessionFile. Raw data is available only for the live session when allowed.";

export const promptSnippet = "inspect live or persisted SuPi event traces";

export const promptGuidelines: string[] = [];
