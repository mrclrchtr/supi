export const toolDescription =
  "Preview one semantic rename or extraction and return a planId without mutating files.";

export const promptSnippet = "preview a precise semantic refactor";

export const promptGuidelines = [
  "Use code_refactor_plan for preview only, then call code_refactor_apply with its planId.",
];
