/** Model-facing description for antigravity_run. */
export const toolDescription =
  "Run one bounded, permission-controlled Antigravity consultation with optional web and workspace evidence.";

/** One-line entry for Pi's available-tools prompt section. */
export const promptSnippet = "Ask Antigravity for a bounded web or workspace consultation.";

/** Guidelines shown only while antigravity_run is active. */
export const promptGuidelines = [
  "Use antigravity_run for a focused external consultation, not for file mutation or shell commands.",
  "Use new with workspace false for web-only questions and workspace true when code inspection is required.",
  "Use the returned Conversation Handle for a follow-up; do not invent or alter a handle.",
  "Treat claimed sources and workspace paths as unverified unless the result marks them observed.",
];
