// Prompt guidance and tool description for the supi_cache_forensics tool.

export const toolDescription =
  'Investigate prompt cache regressions across historical PI sessions. Provides four query patterns: hotspots (worst drops), breakdown (cause tally), correlate (tools before regressions), and idle (long-gap regressions). Example: {"pattern": "hotspots", "since": "7d", "minDrop": 20}';

export const promptSnippet =
  "Use `supi_cache_forensics` to investigate prompt cache regressions, cause breakdowns, idle drops, and tool correlations across historical sessions.";

export const promptGuidelines = [
  "Use `supi_cache_forensics` when the user asks about cache performance patterns, suspects idle-time cache expiry, or wants to understand what preceded a cache drop.",
  "Prefer `pattern: 'breakdown'` for a quick overview of regression causes.",
  "Use `pattern: 'hotspots'` with `minDrop: 20` or higher to surface the worst regressions.",
  "Use `pattern: 'idle'` to detect cache drops caused by long gaps between turns.",
  "Use `pattern: 'correlate'` to see which tool calls preceded regressions.",
  "The tool returns shape fingerprints (param types and lengths), not raw file paths or command text.",
];
