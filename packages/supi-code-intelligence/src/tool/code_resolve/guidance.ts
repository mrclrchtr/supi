export const toolDescription =
  "Resolve one provider-backed anchor or semantic symbol query to session handles, or enumerate a file's declarations as a bounded Target group. Anchors must identify real symbols";

export const promptSnippet = "resolve a precise target or enumerate a file’s target group";

export const promptGuidelines = [
  "Use code_resolve when a symbol query may be ambiguous, when later calls should share a stable target handle, or when a known file’s declarations should be enumerated.",
];
