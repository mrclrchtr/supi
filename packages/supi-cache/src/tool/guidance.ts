// Prompt guidance and tool description for the cache_forensics tool.

export const toolDescription =
  "Investigate prompt-cache regressions across historical PI sessions. Patterns: hotspots, breakdown, correlate, and idle. Results use redacted shape fingerprints and are limited to 2,000 lines or 51,200 bytes; the complete output is saved to a temporary file when exceeded.";

export const promptSnippet =
  "cache_forensics — investigate historical cache regressions and causes";

export const promptGuidelines = [
  "Use cache_forensics for prompt-cache regressions, cache patterns, or what preceded a drop.",
  "In cache_forensics, choose pattern: breakdown=cause totals, hotspots=biggest drops, idle=long gaps, correlate=preceding tool shapes; results are redacted shapes, not raw paths/commands.",
];
