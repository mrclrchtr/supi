// Prompt guidance and tool description for the supi_cache_forensics tool.

export const toolDescription =
  "Investigate prompt-cache regressions across historical PI sessions. Patterns: hotspots, breakdown, correlate, and idle. Results use redacted shape fingerprints.";

export const promptSnippet =
  "supi_cache_forensics — investigate historical cache regressions and causes";

export const promptGuidelines = [
  "Use supi_cache_forensics for prompt-cache regressions, cache patterns, or what preceded a drop.",
  "In supi_cache_forensics, choose pattern: breakdown=cause totals, hotspots=biggest drops, idle=long gaps, correlate=preceding tool shapes; results are redacted shapes, not raw paths/commands.",
];
