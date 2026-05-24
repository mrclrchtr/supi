// Prompt guidance and tool description for the supi_cache_forensics tool.

export const toolDescription =
  "Investigate prompt cache regressions across historical PI sessions. Patterns: hotspots, breakdown, correlate, and idle. Results use redacted shape fingerprints.";

export const promptSnippet =
  "supi_cache_forensics — investigate historical cache regressions and causes";

export const promptGuidelines = [
  "Use supi_cache_forensics when the user asks about cache regressions, cache patterns, or what preceded a drop.",
  'Use supi_cache_forensics with `pattern: "breakdown"` for cause totals, or `pattern: "hotspots"` with `minDrop` for the biggest drops.',
  'Use supi_cache_forensics with `pattern: "idle"` for long-gap drops and `pattern: "correlate"` for preceding tool-call shapes.',
  "Use supi_cache_forensics results as shape fingerprints and parameter summaries, not raw paths or command text.",
];
