// Prompt guidance and tool description for the supi_cache_forensics tool.

export const toolDescription =
  'Investigate prompt cache regressions across historical PI sessions. Query patterns: hotspots (worst drops), breakdown (cause tally), correlate (tools before regressions), and idle (long-gap regressions). Results redact raw file paths and command text into shape fingerprints. Example: {"pattern": "hotspots", "since": "7d", "minDrop": 20}';

export const promptSnippet =
  "supi_cache_forensics — investigate historical prompt cache regressions, causes, idle drops, and preceding tool activity";

export const promptGuidelines = [
  "Use supi_cache_forensics when the user asks about cache performance patterns, suspects idle-time cache expiry, or wants to understand what preceded a cache drop.",
  'Use supi_cache_forensics with `pattern: "breakdown"` for a quick overview of regression causes.',
  'Use supi_cache_forensics with `pattern: "hotspots"` and `minDrop: 20` or higher to surface the worst regressions.',
  'Use supi_cache_forensics with `pattern: "idle"` to detect cache drops caused by long gaps between turns.',
  'Use supi_cache_forensics with `pattern: "correlate"` to see which tool-call shapes preceded regressions.',
  "supi_cache_forensics returns shape fingerprints and parameter summaries, not raw file paths or command text.",
];
